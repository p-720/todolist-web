import { WebSocketServer } from "ws";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { authenticateFromRequest } from "./auth-server.js";

// Standalone module: runs outside the SvelteKit bundle, so NO imports from
// src/ (the flake ships this file without src/). Own sqlite connection; habit
// lookups are hand-mirrored from src/lib/server/db.ts — keep in sync.
const dbPath = path.join(process.cwd(), "data", "pomotasker.db");
let db;

function getDb() {
	if (!db) {
		const dir = path.dirname(dbPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
	}
	return db;
}

function getHabitRow(id) {
	return getDb().prepare("SELECT id, name, goal_id FROM habits WHERE id = ?").get(id);
}
function getHabitByGoalId(goalId) {
	return getDb()
		.prepare("SELECT id, name, goal_id FROM habits WHERE goal_id = ? ORDER BY id LIMIT 1")
		.get(goalId);
}

// Per-user live state. A user's clients (browser PWA, Android WebView,
// desktop PWA) all share one logical timer, keyed by user id.
const STOPPED = {
	activeHabitId: null,
	name: null,
	mode: "stopwatch",
	elapsed: 0,
	running: false,
	startTime: null,
	elapsedBefore: 0,
};
const stateByUser = new Map(); // userId -> { user, timer, lastHabitId, lastSessionId, snapshot }
// userId -> Set<WebSocket>
const connections = new Map();

function getState(user) {
	let st = stateByUser.get(user.id);
	if (!st) {
		st = { user, timer: null, lastHabitId: null, lastSessionId: null, snapshot: { ...STOPPED } };
		stateByUser.set(user.id, st);
	}
	return st;
}

function broadcastToUser(userId, message) {
	const clients = connections.get(userId);
	if (!clients) return;
	const text = JSON.stringify(message);
	for (const c of clients) {
		if (c.readyState === 1 /* OPEN */) c.send(text);
	}
}

function handleMessage(ws, user, msg) {
	const state = getState(user);
	if (msg.type === "ping") {
		ws.send(JSON.stringify({ type: "pong", user: user.username }));
		return;
	}

	// Keep the persistent snapshot (like the pre-auth server did): a client
	// that reconnects later (tab refresh, app backgrounded) is synced this
	// state on connect, so a running timer survives reloads.
	if (msg.type === "timer:update") {
		const d = msg.data || {};
		state.snapshot = { ...state.snapshot, ...d };
		state.timer = d.running && d.activeHabitId ? { running: true, habitId: d.activeHabitId } : null;
		state.lastHabitId = d.activeHabitId ?? null;
	} else if (msg.type === "timer:stop") {
		// A bare `timer:stop` (rofi / polybar / phone picker) carries no data.
		// Normalize to a full stopped state: otherwise the snapshot stays
		// "running" forever when no web client is connected to echo the stop,
		// and every new client is synced a stale running timer.
		state.snapshot = { ...STOPPED, ...(msg.data || {}) };
		state.timer = null;
	}

	// Raw router: broadcast to the user's other clients (same shape the
	// pre-auth server used; `user` tells each client whose state this is).
	broadcastToUser(user.id, { ...msg, user: user.username });
}

export function initWebSocket(
	server,
	basePath = "/pomotask",
	{ passive = false } = {},
) {
	const wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "", "http://localhost");
		const path_ = `${basePath}/ws`;
		if (url.pathname !== path_) {
			// passive = shared server (vite dev): other upgrade consumers exist
			// (vite's HMR ws) — never touch sockets that aren't ours.
			if (!passive) socket.destroy();
			return;
		}

		// Authenticate BEFORE upgrading: cookie (browsers), ?token=<jwt> or
		// ?key=<api key> (native clients / scripts).
		const cookieHeader = req.headers["cookie"];
		const authHeader = req.headers["authorization"];
		const search = url.searchParams.get("token")
			? `?token=${url.searchParams.get("token")}`
			: url.searchParams.get("key")
				? `?key=${url.searchParams.get("key")}`
				: "";

		authenticateFromRequest({ cookieHeader, authHeader, search })
			.then((user) => {
				if (!user) {
					try {
						req.socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					} catch {}
					socket.destroy();
					return;
				}
				wss.handleUpgrade(req, socket, head, (ws) => {
					wss.emit("connection", ws, req, user);
				});
			})
			.catch(() => socket.destroy());
	});

	wss.on("connection", (ws, req, user) => {
		console.log(`[ws] ${user.username} connected`);

		if (!connections.has(user.id)) connections.set(user.id, new Set());
		connections.get(user.id).add(ws);

		// Sync the new client with this user's current timer (the frontend
		// restores its store from timer:sync).
		const state = stateByUser.get(user.id);
		ws.send(
			JSON.stringify({
				type: "timer:sync",
				data: state ? { ...state.snapshot } : { ...STOPPED },
				user: user.username,
			}),
		);

		ws.on("message", (data) => {
			try {
				const msg = JSON.parse(data.toString());
				handleMessage(ws, user, msg);
			} catch (e) {
				console.error("[ws] bad message:", e.message);
			}
		});

		ws.on("close", () => {
			const set = connections.get(user.id);
			if (set) {
				set.delete(ws);
				if (set.size === 0) connections.delete(user.id);
			}
			console.log(`[ws] ${user.username} disconnected`);
		});
	});

	return wss;
}

/**
 * Goal reminder notifications: relay to connected clients. Sent to the owner
 * of the active timer when resolvable, otherwise to all connected users
 * (clients filter by the `user` field).
 */
export function sendNotifications(notifications) {
	if (!notifications.length) return;
	const d = getDb();

	for (const n of notifications) {
		let habit = null;
		let owner = null;
		let sessionId = null;
		if (n.kind === "goal_expired" || n.kind === "goal_due_soon") {
			habit = getHabitByGoalId(n.goal.id);
		} else if (n.habitId) {
			habit = getHabitRow(n.habitId);
		}
		if (habit) {
			for (const [uid, st] of stateByUser) {
				if (st.timer && st.timer.habitId === habit.id) {
					owner = uid;
					sessionId = st.lastSessionId;
					break;
				}
			}
		}

		const targets =
			owner != null && connections.has(owner) ? [owner] : [...connections.keys()];

		for (const uid of targets) {
			const u = d.prepare("SELECT username FROM users WHERE id = ?").get(uid);
			if (!u) continue;
			broadcastToUser(uid, {
				type: "notification",
				kind: n.kind,
				title: n.title,
				body: n.body,
				habitId: habit?.id ?? null,
				sessionId: sessionId ?? null,
				user: u.username,
			});
		}
	}
}

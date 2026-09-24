import { browser } from "$app/environment";
import { base } from "$app/paths";
import { get } from "svelte/store";
import { timerStore } from "./timer.js";
import { authStore } from "./auth.js";

let ws = null;
let reconnectTimer = null;
let pingTimer = null;
const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;
const CLIENT_ID = browser ? Math.random().toString(36).slice(2, 9) : "server";

export function initSync() {
	if (!browser) return;
	connect();
}

// Self-heal for restored pages (Android WebView state restore, tab return):
// onMount may never have run, so the socket can be dead with nothing to
// restart it. Reconnecting on focus is a no-op while OPEN/CONNECTING, and is
// gated on auth so the pre-login page doesn't 401-poll the server.
if (browser) {
	window.addEventListener("focus", () => {
		if (get(authStore).authenticated) connect();
	});
}

function startPing() {
	clearPing();
	pingTimer = setInterval(() => {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "ping", clientId: CLIENT_ID }));
		}
	}, PING_INTERVAL);
}

function clearPing() {
	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
}

function connect() {
	if (
		ws?.readyState === WebSocket.OPEN ||
		ws?.readyState === WebSocket.CONNECTING
	)
		return;

	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const wsUrl = `${protocol}//${window.location.host}${base}/ws`;

	ws = new WebSocket(wsUrl);

	ws.onopen = () => {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		startPing();
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data);
			if (msg.clientId === CLIENT_ID) return; // Ignore own echo
			handleMessage(msg);
		} catch (e) {
			console.error("WS message error:", e);
		}
	};

	ws.onclose = (event) => {
		clearPing();
		// 1008 policy error = failed auth: stop hammering, go to login
		if (event?.code === 1008) {
			window.location.href = `${base}/login`;
			return;
		}
		reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
	};

	ws.onerror = () => {
		if (ws) ws.close();
	};
}

export function reconnect() {
	if (ws) {
		ws.onclose = null; // Prevent scheduling old reconnect
		ws.close();
	}
	ws = null;
	clearPing();
	connect();
}

function handleMessage(msg) {
	switch (msg.type) {
		case "timer:sync":
		case "timer:update":
			timerStore.set(msg.data);
			break;
		case "timer:stop":
			timerStore.stop();
			break;
		case "habits:update":
			window.dispatchEvent(new CustomEvent("sync:habits"));
			break;
		case "sessions:update":
			window.dispatchEvent(new CustomEvent("sync:sessions"));
			break;
		case "notes:update":
			window.dispatchEvent(new CustomEvent("sync:notes", { detail: msg.data }));
			break;
		case "goals:update":
			window.dispatchEvent(new CustomEvent("sync:goals"));
			break;
		case "quote:update":
			window.dispatchEvent(new CustomEvent("sync:quote"));
			break;
	}
}

export function send(msg) {
	// Dispatch locally first so the current tab reacts
	handleMessage(msg);
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ ...msg, clientId: CLIENT_ID }));
	}
}

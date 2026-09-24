// Shared auth core: users, scrypt password hashing, JWT (jose, HS256),
// API keys. Plain JS on purpose (no src/ imports) so ws-server.js and the
// SvelteKit bundle (src/lib/server/auth.ts re-exports this) share ONE
// implementation. Owns its sqlite connection, same pattern as
// ws-server.js / reminders.js.
//
// Kill switch: rotate data/auth-secret to invalidate every JWT at once.

import { randomBytes, scryptSync, createHash, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import Database from "better-sqlite3";
import { SignJWT, jwtVerify } from "jose";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "pomotasker.db");
const secretPath = path.join(dataDir, "auth-secret");

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
export const SESSION_COOKIE = "pomo_token";
export const API_KEY_PREFIX = "pomo_";

// --- signing secret ---------------------------------------------------------

export function getAuthSecret() {
	let raw = null;
	try {
		raw = readFileSync(secretPath, "utf8").trim();
		if (Buffer.from(raw, "base64").length >= 32) return raw;
	} catch {}
	const fresh = randomBytes(32).toString("base64");
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	writeFileSync(secretPath, fresh, { mode: 0o600 });
	return fresh;
}

// --- password hashing (scrypt, fixed params) --------------------------------

export function hashPassword(password) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
	return `s2$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
	if (typeof stored !== "string" || !stored.startsWith("s2$")) return false;
	const [, N, r, p, saltB64, hashB64] = stored.split("$");
	let expected;
	try {
		expected = scryptSync(password, Buffer.from(saltB64, "base64"), 64, {
			N: Number(N),
			r: Number(r),
			p: Number(p),
		});
	} catch {
		return false;
	}
	return timingSafeEqual(expected, Buffer.from(hashB64, "base64"));
}

// --- users / api keys --------------------------------------------------------

let db;
export function getAuthDb() {
	if (!db) {
		if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
		db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
		// Only what auth needs; the full schema lives in src/lib/server/db.ts.
		// users/meta come first: the reminder tick runs before any HTTP request
		// on a fresh db, and it queries users.
		db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );
    `);
	}
	return db;
}

const now = () => new Date().toISOString().replace("T", " ").substring(0, 19);

export function getUserByName(name) {
	return getAuthDb().prepare("SELECT * FROM users WHERE username = ?").get(name);
}

export function getUser(id) {
	return getAuthDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function addUser(name, password) {
	const result = getAuthDb()
		.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
		.run(name, hashPassword(password), now());
	return getUser(result.lastInsertRowid);
}

export function listApiKeys(userId) {
	return getAuthDb()
		.prepare(
			"SELECT id, user_id, name, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY id",
		)
		.all(userId);
}

export function createApiKey(userId, name) {
	const raw = API_KEY_PREFIX + randomBytes(32).toString("base64url");
	const keyHash = createHash("sha256").update(raw).digest("hex");
	const result = getAuthDb()
		.prepare(
			"INSERT INTO api_keys (user_id, name, key_hash, created_at) VALUES (?, ?, ?, ?)",
		)
		.run(userId, name, keyHash, now());
	return {
		id: result.lastInsertRowid,
		raw,
		name,
		userId,
	};
}

export function deleteApiKey(userId, id) {
	return (
		getAuthDb()
			.prepare("DELETE FROM api_keys WHERE user_id = ? AND id = ?")
			.run(userId, id).changes > 0
	);
}

// --- verification -------------------------------------------------------------

function sha256Hex(s) {
	return createHash("sha256").update(s).digest("hex");
}

export function findUserByApiKey(raw) {
	if (typeof raw !== "string" || !raw.startsWith(API_KEY_PREFIX)) return null;
	const row = getAuthDb()
		.prepare(
			"SELECT u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?",
		)
		.get(sha256Hex(raw));
	if (!row) return null;
	getAuthDb().prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?").run(
		now(),
		sha256Hex(raw),
	);
	return row;
}

async function verifyToken(token) {
	if (typeof token !== "string" || token.length === 0) return null;
	try {
		const { payload } = await jwtVerify(
			token,
			new TextEncoder().encode(getAuthSecret()),
		);
		const user = getUser(Number(payload.sub));
		if (!user) return null;
		return user;
	} catch {
		return null;
	}
}

export async function signUserToken(user) {
	return new SignJWT({ username: user.username })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(String(user.id))
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
		.sign(new TextEncoder().encode(getAuthSecret()));
}

/**
 * Authenticate from a request-ish object. Accepts loose inputs so both
 * SvelteKit events and raw http/upgrade requests work:
 *   cookieHeader: "pomo_token=..." (may be absent)
 *   authHeader:   "Bearer <jwt|pomo_key>" (may be absent)
 *   search:       "?token=...&key=..." (may be absent)
 * Returns the user row or null.
 */
export async function authenticateFromRequest({ cookieHeader, authHeader, search }) {
	// 1. session cookie (browsers, WebView)
	if (typeof cookieHeader === "string" && cookieHeader) {
		const m = cookieHeader.match(/(?:^|;\s*)pomo_token=([^;]+)/);
		if (m) {
			const user = await verifyToken(decodeURIComponent(m[1]));
			if (user) return user;
		}
	}
	// 2. Authorization: Bearer (JWT or API key) — native app, scripts, curl
	if (typeof authHeader === "string" && authHeader) {
		const m = authHeader.match(/^Bearer\s+(\S+)$/i);
		if (m) {
			if (m[1].startsWith(API_KEY_PREFIX)) return findUserByApiKey(m[1]);
			const user = await verifyToken(m[1]);
			if (user) return user;
		}
	}
	// 3. query string (WS clients that can't send headers/cookies)
	if (typeof search === "string" && search) {
		const q = new URLSearchParams(search.startsWith("?") ? search : "?" + search);
		const key = q.get("key");
		if (key) {
			const user = findUserByApiKey(key);
			if (user) return user;
		}
		const token = q.get("token");
		if (token) return verifyToken(token);
	}
	return null;
}

// --- rate limiting (in-memory, per IP+route) ---------------------------------

const buckets = new Map(); // key -> [timestamps]
const RATE_LIMIT = 10; // attempts
const RATE_WINDOW_MS = 15 * 60 * 1000;

setInterval(() => {
	const cutoff = Date.now() - RATE_WINDOW_MS;
	for (const [k, list] of buckets) {
		while (list.length && list[0] < cutoff) list.shift();
		if (list.length === 0) buckets.delete(k);
	}
}, 5 * 60 * 1000).unref();

/** Returns false when the budget is exhausted. */
export function rateLimit(key) {
	const nowMs = Date.now();
	const cutoff = nowMs - RATE_WINDOW_MS;
	let list = buckets.get(key) || [];
	list = list.filter((t) => t >= cutoff);
	if (list.length >= RATE_LIMIT) {
		buckets.set(key, list);
		return false;
	}
	list.push(nowMs);
	buckets.set(key, list);
	return true;
}

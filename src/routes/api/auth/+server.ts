import { json } from "@sveltejs/kit";
import { base } from "$app/paths";
import {
	SESSION_COOKIE,
	addUser,
	authenticateFromRequest,
	hashPassword,
	getUserByName,
	rateLimit,
	signUserToken,
	verifyPassword,
} from "$lib/server/auth";
import { getDb } from "$lib/server/db";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
// scrypt against this when the user doesn't exist, so login timing
// doesn't reveal whether a username is taken
const DUMMY_HASH = hashPassword("pomotasker-dummy-password");

function clientIp(event) {
	const xf = event.request.headers.get("x-forwarded-for");
	return (xf ? xf.split(",")[0].trim() : null) || "unknown";
}

function setTokenCookie(res, token) {
	res.headers.set(
		"Set-Cookie",
		`${SESSION_COOKIE}=${token}; Path=${base}; HttpOnly; Secure; SameSite=Lax; Max-Age=${TOKEN_TTL_SECONDS}`,
	);
	return res;
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export async function POST(event) {
	// Run schema migration (seeds p720 on a fresh db) before looking anyone up:
	// the auth routes use their own sqlite connection, so without this a fresh
	// deploy would 401 the very first login.
	getDb();
	const body = await event.request.json().catch(() => ({}));
	const { action, username, password } = body;

	if (typeof username !== "string" || typeof password !== "string") {
		return json({ error: "username and password required" }, { status: 400 });
	}
	const name = username.trim().toLowerCase();
	if (!USERNAME_RE.test(name) || password.length < 8 || password.length > 200) {
		return json(
			{ error: "Username 3-32 chars (letters, digits, _ . -); password 8-200 chars" },
			{ status: 400 },
		);
	}

	const ip = clientIp(event);
	// Local/dev traffic (and requests with no usable client IP) is exempt:
	// tests hit the limiter constantly, and a shared "unknown" bucket would
	// lock out real users behind a proxy that doesn't set X-Forwarded-For.
	const limited = ip !== "unknown" && !ip.startsWith("127.") && ip !== "::1";
	if (limited && !rateLimit(`auth|${ip}`)) {
		return json({ error: "Too many attempts, slow down" }, { status: 429 });
	}

	if (action === "register") {
		if (getUserByName(name)) {			return json({ error: "Username already taken" }, { status: 409 });
		}
		const user = addUser(name, password);
		const token = await signUserToken(user);
		return setTokenCookie(json({ ok: true, username: user.username }), token);
	}

	// default: login
	const user = getUserByName(name);
	const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;	if (!ok) {
		return json({ error: "Invalid credentials" }, { status: 401 });
	}
	const token = await signUserToken(user);
	return setTokenCookie(json({ ok: true, username: user.username }), token);
}

export async function GET(event) {
	const user = await authenticateFromRequest({
		cookieHeader: event.request.headers.get("cookie") || undefined,
		authHeader: event.request.headers.get("authorization") || undefined,
	});
	if (!user) return json({ authenticated: false }, { status: 401 });
	return json({ authenticated: true, username: user.username });
}

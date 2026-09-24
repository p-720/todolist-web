import { json } from "@sveltejs/kit";
import { base } from "$app/paths";
import { SESSION_COOKIE } from "$lib/server/auth";

export async function POST({ request }) {
	const res = json({ ok: true });
	res.headers.set(
		"Set-Cookie",
		`${SESSION_COOKIE}=; Path=${base}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
	);
	return res;
}

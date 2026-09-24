import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { getSetting, setSetting } from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

const KEY = "quote";
const MAX = 300;

export const GET = (async ({ request }) => {
	const user = await requireUser(request);
	const row = getSetting(user.id, KEY);
	return json({
		quote: row ? { content: row.value, updated_at: row.updated_at } : null,
	});
}) satisfies RequestHandler;

export const PUT = (async ({ request }) => {
	const user = await requireUser(request);
	const body = await request.json();
	const content = String(body.content ?? "").slice(0, MAX);
	const row = setSetting(user.id, KEY, content);
	return json({
		quote: row ? { content: row.value, updated_at: row.updated_at } : null,
	});
}) satisfies RequestHandler;

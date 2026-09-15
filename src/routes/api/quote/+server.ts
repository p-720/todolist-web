import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { getSetting, setSetting } from "$lib/server/db";

const KEY = "quote";
const MAX = 300;

export const GET = (() => {
	const row = getSetting(KEY);
	return json({
		quote: row ? { content: row.value, updated_at: row.updated_at } : null,
	});
}) satisfies RequestHandler;

export const PUT = (async ({ request }) => {
	const body = await request.json();
	const content = String(body.content ?? "").slice(0, MAX);
	const row = setSetting(KEY, content);
	return json({
		quote: row ? { content: row.value, updated_at: row.updated_at } : null,
	});
}) satisfies RequestHandler;

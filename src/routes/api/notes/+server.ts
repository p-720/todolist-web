import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { getNote, setNote } from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export const GET = (async ({ url, request }) => {
	const user = await requireUser(request);
	const date = url.searchParams.get("date");
	if (!date) {
		return json({ error: "Missing date" }, { status: 400 });
	}
	const note = getNote(user.id, date);
	return json({ note: note || null });
}) satisfies RequestHandler;

export const PUT = (async ({ request }) => {
	const user = await requireUser(request);
	const body = await request.json();
	const { date, content } = body;
	if (!date) {
		return json({ error: "Missing date" }, { status: 400 });
	}
	const note = setNote(user.id, date, content);
	return json({ note });
}) satisfies RequestHandler;

import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { getHabit, unarchiveHabit } from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export const POST = (async ({ params, request }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const habit = getHabit(id, user.id);
	if (!habit) return json({ error: "Not found" }, { status: 404 });
	unarchiveHabit(id, user.id);
	return json({ success: true });
}) satisfies RequestHandler;

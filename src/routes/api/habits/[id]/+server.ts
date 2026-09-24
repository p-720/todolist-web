import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import {
	deleteHabit,
	updateHabit,
	updateHabitOrder,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export const PUT = (async ({ request, params }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const body = await request.json();
	const { description, habitType, minValue, groupId } = body;
	updateHabit(id, user.id, description, habitType, minValue, groupId ?? null);
	return json({ success: true });
}) satisfies RequestHandler;

export const PATCH = (async ({ request, params }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const body = await request.json();
	if (body.group_id !== undefined && body.order_index !== undefined) {
		updateHabitOrder(id, user.id, body.group_id, body.order_index);
		return json({ success: true });
	}
	return json({ error: "Invalid patch body" }, { status: 400 });
}) satisfies RequestHandler;

export const DELETE = (async ({ params, request }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	deleteHabit(id, user.id);
	return json({ success: true });
}) satisfies RequestHandler;

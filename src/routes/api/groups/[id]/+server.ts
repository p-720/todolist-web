import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import {
	deleteGroup,
	getDefaultGroup,
	getGroup,
	updateGroup,
	updateGroupCollapsed,
	updateGroupOrder,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export const GET = (async ({ params, request }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const group = getGroup(id, user.id);
	if (!group) return json({ error: "Not found" }, { status: 404 });
	return json(group);
}) satisfies RequestHandler;

export const PATCH = (async ({ request, params }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const body = await request.json();
	const group = getGroup(id, user.id);
	if (!group) return json({ error: "Not found" }, { status: 404 });

	if (body.order_index !== undefined) {
		updateGroupOrder(id, user.id, body.order_index);
		return json({ success: true });
	}

	if (body.collapsed !== undefined) {
		updateGroupCollapsed(id, user.id, body.collapsed);
		return json({ success: true });
	}

	const name = body.name?.trim() ?? group.name;
	const icon = body.icon ?? group.icon;
	const color = body.color ?? group.color;
	try {
		updateGroup(id, user.id, name, icon, color);
		return json({ success: true });
	} catch (e) {
		if (e.message?.includes("UNIQUE constraint failed")) {
			return json({ error: "Group name already exists" }, { status: 409 });
		}
		throw e;
	}
}) satisfies RequestHandler;

export const DELETE = (async ({ params, request }) => {
	const user = await requireUser(request);
	const id = Number(params.id);
	const group = getGroup(id, user.id);
	if (!group) return json({ error: "Not found" }, { status: 404 });
	const defaultGroup = getDefaultGroup(user.id);
	if (defaultGroup && group.id === defaultGroup.id) {
		return json({ error: "Cannot delete default group" }, { status: 403 });
	}
	deleteGroup(id, user.id);
	return json({ success: true });
}) satisfies RequestHandler;

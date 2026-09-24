import { json } from "@sveltejs/kit";
import {
	addGroup,
	getGroups,
	updateGroupOrder,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export async function GET({ request }) {
	const user = await requireUser(request);
	return json(getGroups(user.id));
}

export async function POST({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	const { name, icon, color } = body;
	if (!name?.trim()) {
		return json({ error: "Name required" }, { status: 400 });
	}
	try {
		const id = addGroup(user.id, name.trim(), icon ?? null, color ?? null);
		return json({ id });
	} catch (e) {
		if (e.message?.includes("UNIQUE constraint failed")) {
			return json({ error: "Group name already exists" }, { status: 409 });
		}
		throw e;
	}
}

export async function PUT({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	const { orderedIds } = body;
	for (const [i, id] of orderedIds.entries()) {
		updateGroupOrder(id, user.id, i);
	}
	return json({ ok: true });
}

import { json } from "@sveltejs/kit";
import {
	addHabit,
	getArchivedHabits,
	getHabitsTree,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export async function GET({ url, request }) {
	const user = await requireUser(request);
	const archived = url.searchParams.get("archived");
	if (archived === "true") {
		const habits = getArchivedHabits(user.id);
		return json(habits);
	}
	const tree = getHabitsTree(user.id);
	return json(tree);
}

export async function POST({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	const { description, habitType, minValue, groupId } = body;
	if (!description?.trim()) {
		return json({ error: "Description required" }, { status: 400 });
	}
	const id = addHabit(
		user.id,
		description,
		habitType ?? "timer",
		minValue ?? null,
		groupId ?? null,
	);
	return json({ id });
}

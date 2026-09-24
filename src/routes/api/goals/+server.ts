import { json } from "@sveltejs/kit";
import { addGoal, getGoals } from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export async function GET({ request }) {
	const user = await requireUser(request);
	return json(getGoals(user.id));
}

export async function POST({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	if (body.title === undefined) {
		return json({ error: "missing title" }, { status: 400 });
	}
	if (!body.dueDate) {
		return json({ error: "missing due_date" }, { status: 400 });
	}
	const type = body.type === "numbered" ? "numbered" : "text";
	if (
		type === "numbered" &&
		(!Number.isInteger(body.startValue) || !Number.isInteger(body.targetValue))
	) {
		return json({ error: "start and target must be integers" }, { status: 400 });
	}
	const id = addGoal(
		user.id,
		body.title,
		body.description ?? "",
		body.dueDate,
		type,
		body.startValue ?? null,
		body.targetValue ?? null,
	);
	return json({ id });
}

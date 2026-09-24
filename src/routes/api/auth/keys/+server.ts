import { json } from "@sveltejs/kit";
import {
	createApiKey,
	deleteApiKey,
	listApiKeys,
	requireUser,
} from "$lib/server/auth";

const NAME_RE = /^[a-zA-Z0-9 _-]{1,32}$/;

export async function GET(event) {
	const user = await requireUser(event);
	return json(listApiKeys(user.id));
}

export async function POST(event) {
	const user = await requireUser(event);
	const body = await event.request.json().catch(() => ({}));
	const name = String(body.name ?? "default").trim();
	if (!NAME_RE.test(name)) {
		return json({ error: "Key name 1-32 chars (letters, digits, space _ -)" }, { status: 400 });
	}
	const key = createApiKey(user.id, name);
	// raw key is shown exactly once — only in this response
	return json({
		id: key.id,
		name: key.name,
		raw: key.raw,
		created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
	}, { status: 201 });
}

export async function DELETE(event) {
	const user = await requireUser(event);
	const url = new URL(event.request.url);
	const id = Number(url.searchParams.get("id"));
	if (!Number.isInteger(id)) return json({ error: "id required" }, { status: 400 });
	const ok = deleteApiKey(user.id, id);
	return ok ? json({ ok: true }) : json({ error: "not found" }, { status: 404 });
}

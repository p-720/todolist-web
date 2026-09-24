import { json } from "@sveltejs/kit";
import {
	deletePushSubscription,
	savePushSubscription,
} from "$lib/server/db";
import { getVapidPublicKey } from "$lib/server/vapid";
import { requireUser } from "$lib/server/auth";

// Public on purpose: a VAPID key is a PUBLIC key, and the Android WebView
// needs it before any subscription can be created.
export function GET() {
	return json({ publicKey: getVapidPublicKey() });
}

export async function POST({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	if (!body.subscription?.endpoint) {
		return json({ error: "missing subscription" }, { status: 400 });
	}
	savePushSubscription(
		user.id,
		body.subscription.endpoint,
		JSON.stringify(body.subscription.keys),
		body.tzOffsetMinutes ?? 0,
	);
	return json({ ok: true });
}

export async function DELETE({ request }) {
	const user = await requireUser(request);
	const body = await request.json();
	if (body.endpoint) deletePushSubscription(user.id, body.endpoint);
	return json({ ok: true });
}

import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import {
	disconnect,
	getAuthUrl,
	getStatus,
	handleTimerEvent,
	listCalendars,
	recentEvents,
	saveCreds,
	selectCalendar,
} from "$lib/server/calendar";
import { requireUser } from "$lib/server/auth";

// Per-user: each logged-in user has their own Google account + selected
// calendar (calendar_creds row). The OAuth callback carries the user via ?state.
export const GET = (async ({ url, request }) => {
	const user = await requireUser(request);

	if (url.searchParams.get("connect")) {
		try {
			const authUrl = getAuthUrl(user.id);
			return authUrl ? json({ authUrl }) : json({ authUrl: null, reason: "add client id/secret first" }, { status: 400 });
		} catch (e) {
			return json({ authUrl: null, reason: msg(e) }, { status: 500 });
		}
	}

	if (url.searchParams.get("list")) {
		try {
			return json({ calendars: await listCalendars(user.id) });
		} catch (e) {
			return json({ calendars: null, error: msg(e) }, { status: 502 });
		}
	}

	if (url.searchParams.get("events")) {
		const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 5));
		try {
			const events = await recentEvents(user.id, limit);
			if (!events) return json({ events: null, reason: "no calendar selected" }, { status: 400 });
			return json({ events });
		} catch (e) {
			return json({ events: null, error: msg(e) }, { status: 502 });
		}
	}

	return json(getStatus(user.id));
}) satisfies RequestHandler;
export const POST = (async ({ url, request }) => {
	const user = await requireUser(request);
	const action = url.searchParams.get("action") || "";
	const body = await request.json().catch(() => ({}));

	switch (action) {
		case "creds": {
			if (!body.clientId || !body.clientSecret) return json({ ok: false }, { status: 400 });
			saveCreds(user.id, String(body.clientId), String(body.clientSecret));
			return json({ ok: true });
		}
		case "select": {
			if (!body.calendarId) return json({ ok: false }, { status: 400 });
			selectCalendar(user.id, String(body.calendarId), body.calendarName ? String(body.calendarName) : undefined);
			return json({ ok: true });
		}
		case "disconnect": {
			disconnect(user.id);
			return json({ ok: true });
		}
		case "timer": {
			const habit = body.habit as { id?: number; description?: string } | undefined;
			if (!habit?.id) return json({ ok: false }, { status: 400 });
			// fire-and-forget: google latency must not block the timer
			void handleTimerEvent(
				user.id,
				{ id: Number(habit.id), description: habit.description || `habit ${habit.id}` },
				body.event === "stop" ? "stop" : "start",
				body.durationSeconds != null ? Number(body.durationSeconds) : undefined,
			);
			return json({ ok: true });
		}
	}
	return json({ ok: false, reason: `unknown action ${action}` }, { status: 400 });
}) satisfies RequestHandler;

function msg(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}

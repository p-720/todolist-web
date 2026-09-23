import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import {
	disconnect,
	getAuthUrl,
	getStatus,
	handleTimerEvent,
	listCalendars,
	saveCreds,
	selectCalendar,
} from "$lib/server/calendar";

export const GET = (async ({ url }) => {
	if (url.searchParams.get("connect")) {
		try {
			const authUrl = getAuthUrl();
			return authUrl ? json({ authUrl }) : json({ authUrl: null, reason: "add client id/secret first" }, { status: 400 });
		} catch (e) {
			return json({ authUrl: null, reason: msg(e) }, { status: 500 });
		}
	}

	if (url.searchParams.get("list")) {
		try {
			return json({ calendars: await listCalendars() });
		} catch (e) {
			return json({ calendars: null, error: msg(e) }, { status: 502 });
		}
	}

	return json(getStatus());
}) satisfies RequestHandler;
export const POST = (async ({ url, request }) => {
	const action = url.searchParams.get("action") || "";
	const body = await request.json().catch(() => ({}));

	switch (action) {
		case "creds": {
			if (!body.clientId || !body.clientSecret) return json({ ok: false }, { status: 400 });
			saveCreds(String(body.clientId), String(body.clientSecret));
			return json({ ok: true });
		}
		case "select": {
			if (!body.calendarId) return json({ ok: false }, { status: 400 });
			selectCalendar(String(body.calendarId), body.calendarName ? String(body.calendarName) : undefined);
			return json({ ok: true });
		}
		case "disconnect": {
			disconnect();
			return json({ ok: true });
		}
		case "timer": {
			const habit = body.habit as { id?: number; description?: string } | undefined;
			if (!habit?.id) return json({ ok: false }, { status: 400 });
			// fire-and-forget: google latency must not block the timer
			void handleTimerEvent(
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

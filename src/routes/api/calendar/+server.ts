import type { RequestHandler } from "@sveltejs/kit";
import { base } from "$app/paths";
import { json, text } from "@sveltejs/kit";
import {
	disconnect,
	exchangeCode,
	getAuthUrl,
	getStatus,
	handleTimerEvent,
	listCalendars,
	saveCreds,
	selectCalendar,
} from "$lib/server/calendar";

export const GET = (async ({ url }) => {
	if (url.searchParams.get("callback")) {
		const code = url.searchParams.get("code");
		const err = url.searchParams.get("error");
		if (code) {
			try {
				await exchangeCode(code);
				return text(callbackPage(`Connected to Google Calendar. <a href="${base}/calendar">Continue</a>`));
			} catch (e) {
				return text(callbackPage(`Connect failed: ${msg(e)}`), { status: 500 });
			}
		}
		return text(callbackPage(`Connect failed: ${err || "no code"}`), { status: 500 });
	}

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

function callbackPage(html: string) {
	return `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#1e1e2e;color:#cdd6f4">${html} — redirecting…</body><script>setTimeout(()=>location.href='${base}/calendar',1500)</script></html>`;
}

function msg(e: unknown) {
	return e instanceof Error ? e.message : String(e);
}

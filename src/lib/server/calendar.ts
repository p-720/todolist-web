import pkg from "googleapis";
const { google, Auth } = pkg;
const OAuth2Client = Auth.OAuth2Client;
import { getDb } from "./db.ts";

const redirectUri = () =>
	process.env.GOOGLE_OAUTH_REDIRECT_URI ||
	"https://ug.kyrgyzstan.kg/pomotask/api/calendar/oauth-callback";

export const CALENDAR_SCOPES = [
	"https://www.googleapis.com/auth/calendar.readonly",
	"https://www.googleapis.com/auth/calendar.events",
];

// --- per-user credential storage -------------------------------------------
// One row per user in calendar_creds (created in migrateAuth, which also
// adopts the pre-auth global files into p720's row). Each user supplies
// their OWN OAuth client and connects their OWN Google account.

type CredRow = {
	user_id: number;
	client_id: string;
	client_secret: string;
	token: string | null;
	calendar_id: string | null;
	calendar_name: string | null;
	last_error: string | null;
	last_error_at: string | null;
};

const EMPTY_ROW = (userId: number): CredRow => ({
	user_id: userId,
	client_id: "",
	client_secret: "",
	token: null,
	calendar_id: null,
	calendar_name: null,
	last_error: null,
	last_error_at: null,
});

function credRow(userId: number): CredRow | null {
	return getDb()
		.prepare("SELECT * FROM calendar_creds WHERE user_id = ?")
		.get(userId) as CredRow | null;
}

function writeCred(row: CredRow) {
	getDb()
		.prepare(
			`INSERT INTO calendar_creds
        (user_id, client_id, client_secret, token, calendar_id, calendar_name, last_error, last_error_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          client_id = excluded.client_id,
          client_secret = excluded.client_secret,
          token = excluded.token,
          calendar_id = excluded.calendar_id,
          calendar_name = excluded.calendar_name,
          last_error = excluded.last_error,
          last_error_at = excluded.last_error_at`,
		)
		.run(
			row.user_id,
			row.client_id,
			row.client_secret,
			row.token,
			row.calendar_id,
			row.calendar_name,
			row.last_error,
			row.last_error_at,
		);
}

export function saveCreds(userId: number, clientId: string, clientSecret: string) {
	const base = credRow(userId) ?? EMPTY_ROW(userId);
	writeCred({ ...base, client_id: clientId, client_secret: clientSecret });
}

export function getAuthClient(userId: number): OAuth2Client | null {
	const row = credRow(userId);
	if (!row || !row.client_id || !row.client_secret) return null;
	const client = new OAuth2Client(
		row.client_id,
		row.client_secret,
		redirectUri(),
	);
	if (row.token) {
		try {
			client.setCredentials(JSON.parse(row.token));
		} catch {
			// corrupt token — treat as unconnected
		}
	}
	return client;
}

export function getStatus(userId: number) {
	const r = credRow(userId);
	return {
		hasCreds: !!(r && r.client_id && r.client_secret),
		connected: !!r?.token,
		calendarId: r?.calendar_id || null,
		calendarName: r?.calendar_name || null,
		lastError: r?.last_error || null,
		lastErrorAt: r?.last_error_at || null,
		redirectUri: redirectUri(),
	};
}

export function recordError(userId: number, message: string) {
	const base = credRow(userId) ?? EMPTY_ROW(userId);
	writeCred({ ...base, last_error: message, last_error_at: new Date().toISOString() });
}

export function clearError(userId: number) {
	const r = credRow(userId);
	if (r && (r.last_error || r.last_error_at)) {
		writeCred({ ...r, last_error: null, last_error_at: null });
	}
}

// --- OAuth -------------------------------------------------------------------

export function getAuthUrl(userId: number): string | null {
	const auth = getAuthClient(userId);
	if (!auth) return null;
	return auth.generateAuthUrl({
		access_type: "offline",
		prompt: "consent",
		scope: CALENDAR_SCOPES,
		redirect_uri: redirectUri(),
		// carried back through the callback so the code lands on the right user
		state: String(userId),
	});
}

export async function exchangeCode(code: string, userId: number): Promise<void> {
	const auth = getAuthClient(userId);
	if (!auth) throw new Error("add client id/secret first");
	const { tokens } = await auth.getToken(code);
	if (!tokens?.access_token) throw new Error("google returned no token");
	const base = credRow(userId) ?? EMPTY_ROW(userId);
	writeCred({
		...base,
		token: JSON.stringify({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token || null,
			expiry_date: tokens.expiry_date,
		}),
		last_error: null,
		last_error_at: null,
	});
}

export function disconnect(userId: number) {
	const base = credRow(userId) ?? EMPTY_ROW(userId);
	writeCred({ ...base, token: null, last_error: null, last_error_at: null });
}

// --- calendar access ---------------------------------------------------------

async function buildApi(userId: number) {
	const row = credRow(userId);
	const auth = getAuthClient(userId);
	if (!auth) throw new Error("not connected to google");
	const access = await auth.getAccessToken();
	if (!access) throw new Error("google token invalid (reconnect)");
	// persist refreshed tokens so a restart doesn't lose a live session
	const stored = row?.token ? JSON.parse(row.token) : {};
	if (stored.access_token !== auth.getAccessToken()) {
		writeCred({
			...(row ?? EMPTY_ROW(userId)),
			token: JSON.stringify({
				access_token: auth.getAccessToken(),
				refresh_token: auth.getRefreshToken() || null,
				expiry_date: auth.getExpirationTime(),
			}),
		});
	}
	return google.calendar({ version: "v3", auth });
}

export async function listCalendars(userId: number): Promise<Array<{ id: string; summary: string }>> {
	const g = await buildApi(userId);
	const res = await g.calendarList.list();
	return (res.data.items || []).map((c) => ({ id: c.id!, summary: c.summary || c.id! }));
}

export async function recentEvents(userId: number, limit = 5) {
	const r = credRow(userId);
	if (!r?.calendar_id) return null;
	const g = await buildApi(userId);
	// orderBy=startTime is only allowed with timeMin; use a window and sort client-side
	const timeMin = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
	const res = await g.events.list({ calendarId: r.calendar_id, timeMin, maxResults: limit * 5 });
	const items = (res.data.items || [])
		.filter((e) => e.start?.dateTime)
		.sort((a, b) => (a.start.dateTime! < b.start.dateTime! ? -1 : 1));
	return items.slice(-limit).map((e) => ({
		id: e.id,
		summary: e.summary,
		start: e.start?.dateTime || null,
		end: e.end?.dateTime || null,
	}));
}

export function selectCalendar(userId: number, id: string, name?: string) {
	const base = credRow(userId) ?? EMPTY_ROW(userId);
	writeCred({ ...base, calendar_id: id, calendar_name: name || base.calendar_name });
}

export type CalendarApi = {
	createEvent(calendarId: string, ev: object): Promise<{ id: string }>;
	patchEvent(calendarId: string, eventId: string, patch: object): Promise<unknown>;
};

// --- timer event lifecycle (testable core) -----------------------------------

type OpenRow = { habit_id: number; user_id: number | null; calendar_id: string; event_id: string; start_iso: string };

function getOpen(userId: number, habitId: number): OpenRow | undefined {
	return getDb()
		.prepare("SELECT * FROM calendar_open_events WHERE habit_id = ? AND user_id = ?")
		.get(habitId, userId) as OpenRow | undefined;
}

function clearOpen(userId: number, habitId: number) {
	getDb()
		.prepare("DELETE FROM calendar_open_events WHERE habit_id = ? AND user_id = ?")
		.run(habitId, userId);
}

export async function startEvent(
	api: CalendarApi,
	userId: number,
	calendarId: string,
	habit: { id: number; description: string },
) {
	const now = new Date();
	// Google requires an end time; start 1 min out, the ticker grows it, stop patches the real end
	const end = new Date(now.getTime() + 60 * 1000);
	const open = getOpen(userId, habit.id);
	if (open) {
		// close orphan from a previous run that never stopped
		await api.patchEvent(open.calendar_id, open.event_id, { end: { dateTime: now.toISOString() } });
		clearOpen(userId, habit.id);
	}
	const created = await api.createEvent(calendarId, {
		summary: habit.description,
		start: { dateTime: now.toISOString() },
		end: { dateTime: end.toISOString() },
	});
	getDb()
		.prepare(
			"INSERT OR REPLACE INTO calendar_open_events (habit_id, user_id, calendar_id, event_id, start_iso) VALUES (?, ?, ?, ?, ?)",
		)
		.run(habit.id, userId, calendarId, created.id, now.toISOString());
}

export async function stopEvent(
	api: CalendarApi,
	userId: number,
	habit: { id: number },
	durationSeconds?: number,
) {
	const open = getOpen(userId, habit.id);
	if (!open) return;
	const startMs = new Date(open.start_iso).getTime();
	const end = new Date(startMs + Math.max(0, durationSeconds || 0) * 1000);
	await api.patchEvent(open.calendar_id, open.event_id, {
		end: { dateTime: end.toISOString() },
	});
	clearOpen(userId, habit.id);
}

// --- live ticking: keep the open event's end tracking real time, 1/min ----------

const tickers = new Map<number, ReturnType<typeof setInterval>>();

function stopTicker(habitId: number) {
	const t = tickers.get(habitId);
	if (t) clearInterval(t);
	tickers.delete(habitId);
}

async function startTicker(api: CalendarApi, calendarId: string, habitId: number, eventId: string) {
	stopTicker(habitId);
	tickers.set(
		habitId,
		setInterval(async () => {
			try {
				await api.patchEvent(calendarId, eventId, { end: { dateTime: new Date().toISOString() } });
			} catch {
				// transient; next tick or final stop patch will correct it
			}
		}, 60 * 1000),
	);
}

// --- best-effort entry point called by the API route --------------------------

export async function handleTimerEvent(
	userId: number,
	habit: { id: number; description: string },
	event: "start" | "stop",
	durationSeconds?: number,
) {
	const row = credRow(userId);
	if (!row?.token || !row.calendar_id) return; // silently skip when not set up
	try {
		const g = await buildApi(userId);
		const api: CalendarApi = {
			createEvent: async (cal, ev) =>
				(await g.events.insert({ calendarId: cal, requestBody: ev })).data,
			patchEvent: (cal, id, patch) =>
				g.events.patch({ calendarId: cal, eventId: id, requestBody: patch }),
		};
		if (event === "start") {
			await startEvent(api, userId, row.calendar_id, habit);
			const open = getOpen(userId, habit.id);
			if (open) await startTicker(api, open.calendar_id, habit.id, open.event_id);
		} else {
			stopTicker(habit.id);
			await stopEvent(api, userId, habit, durationSeconds);
		}
		clearError(userId);
	} catch (e: unknown) {
		recordError(userId, e instanceof Error ? e.message : String(e));
	}
}

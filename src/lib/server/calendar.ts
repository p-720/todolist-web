import pkg from "googleapis";
const { google, Auth } = pkg;
const OAuth2Client = Auth.OAuth2Client;
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { getDb } from "./db.ts";

const dataDir = path.join(process.cwd(), "data");
const credsPath = path.join(dataDir, "google-oauth.json");
const tokenPath = path.join(dataDir, "google-token.json");
const prefsPath = path.join(dataDir, "calendar-prefs.json");

export const CALENDAR_SCOPES = [
	"https://www.googleapis.com/auth/calendar.readonly",
	"https://www.googleapis.com/auth/calendar.events",
];

const redirectUri = () =>
	process.env.GOOGLE_OAUTH_REDIRECT_URI ||
	"https://ug.kyrgyzstan.kg/pomotask/api/calendar/oauth-callback";

// --- prefs / secrets -------------------------------------------------------

export type Prefs = {
	calendarId?: string;
	calendarName?: string;
	lastError?: string;
	lastErrorAt?: string;
};

export function loadPrefs(): Prefs {
	try {
		return JSON.parse(readFileSync(prefsPath, "utf8"));
	} catch {
		return {};
	}
}

export function savePrefs(p: Prefs) {
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	writeFileSync(prefsPath, JSON.stringify(p, null, 2));
}

export function recordError(message: string) {
	const p = loadPrefs();
	p.lastError = message;
	p.lastErrorAt = new Date().toISOString();
	savePrefs(p);
}

export function clearError() {
	const p = loadPrefs();
	if (p.lastError || p.lastErrorAt) {
		delete p.lastError;
		delete p.lastErrorAt;
		savePrefs(p);
	}
}

export function saveCreds(clientId: string, clientSecret: string) {
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	writeFileSync(credsPath, JSON.stringify({ client_id: clientId, client_secret: clientSecret }, null, 2));
}

export function getAuthClient(): OAuth2Client | null {
	if (!existsSync(credsPath)) return null;
	const creds = JSON.parse(readFileSync(credsPath, "utf8"));
	const client = new OAuth2Client(
		creds.client_id,
		creds.client_secret,
		redirectUri(),
	);
	try {
		const token = JSON.parse(readFileSync(tokenPath, "utf8"));
		client.setCredentials(token);
	} catch {
		// no token yet
	}
	return client;
}

export function getStatus() {
	const p = loadPrefs();
	return {
		hasCreds: existsSync(credsPath),
		connected: existsSync(tokenPath),
		calendarId: p.calendarId || null,
		calendarName: p.calendarName || null,
		lastError: p.lastError || null,
		lastErrorAt: p.lastErrorAt || null,
		redirectUri: redirectUri(),
	};
}

// --- OAuth -----------------------------------------------------------------

export function getAuthUrl(): string | null {
	const auth = getAuthClient();
	if (!auth) return null;
	return auth.generateAuthUrl({
		access_type: "offline",
		prompt: "consent",
		scope: CALENDAR_SCOPES,
		redirect_uri: redirectUri(),
	});
}

export async function exchangeCode(code: string): Promise<void> {
	const auth = getAuthClient();
	if (!auth) throw new Error("missing google-oauth.json");
	const { tokens } = await auth.getToken(code);
	if (!tokens?.access_token) throw new Error("google returned no token");
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
	clearError();
}

export function disconnect() {
	rmSync(tokenPath, { force: true });
	savePrefs(loadPrefs());
}

// --- calendar access ---------------------------------------------------------

async function buildApi() {
	const auth = getAuthClient();
	if (!auth) throw new Error("not connected to google");
	const access = await auth.getAccessToken();
	if (!access) throw new Error("google token invalid (reconnect)");
	return google.calendar({ version: "v3", auth });
}

export async function listCalendars(): Promise<Array<{ id: string; summary: string }>> {
	const g = await buildApi();
	const res = await g.calendarList.list();
	return (res.data.items || []).map((c) => ({ id: c.id!, summary: c.summary || c.id! }));
}

export async function recentEvents(calendarId: string, limit = 5) {
	const g = await buildApi();
	const res = await g.calendar.events.list({ calendarId, maxResults: limit, orderBy: "startTime" });
	return (res.data.items || []).map((e) => ({
		id: e.id,
		summary: e.summary,
		start: e.start?.dateTime || null,
		end: e.end?.dateTime || null,
	}));
}

export async function selectCalendar(id: string, name?: string) {
	const p = loadPrefs();
	p.calendarId = id;
	p.calendarName = name || p.calendarName;
	savePrefs(p);
}

export type CalendarApi = {
	createEvent(calendarId: string, ev: object): Promise<{ id: string }>;
	patchEvent(calendarId: string, eventId: string, patch: object): Promise<unknown>;
};

// --- timer event lifecycle (testable core) -----------------------------------

type OpenRow = { habit_id: number; calendar_id: string; event_id: string; start_iso: string };

function getOpen(habitId: number): OpenRow | undefined {
	return getDb()
		.prepare("SELECT * FROM calendar_open_events WHERE habit_id = ?")
		.get(habitId) as OpenRow | undefined;
}

function clearOpen(habitId: number) {
	getDb().prepare("DELETE FROM calendar_open_events WHERE habit_id = ?").run(habitId);
}

export async function startEvent(
	api: CalendarApi,
	calendarId: string,
	habit: { id: number; description: string },
	provisionalSeconds?: number,
) {
	const now = new Date();
	// Google requires an end time; use a provisional one until the timer stops
	const provisional = Math.max(60, provisionalSeconds || 60);
	const end = new Date(now.getTime() + provisional * 1000);
	const open = getOpen(habit.id);
	if (open) {
		// close orphan from a previous run that never stopped
		await api.patchEvent(open.calendar_id, open.event_id, { end: { dateTime: now.toISOString() } });
		clearOpen(habit.id);
	}
	const created = await api.createEvent(calendarId, {
		summary: habit.description,
		start: { dateTime: now.toISOString() },
		end: { dateTime: end.toISOString() },
	});
	getDb()
		.prepare(
			"INSERT OR REPLACE INTO calendar_open_events (habit_id, calendar_id, event_id, start_iso) VALUES (?, ?, ?, ?)",
		)
		.run(habit.id, calendarId, created.id, now.toISOString());
}

export async function stopEvent(
	api: CalendarApi,
	habit: { id: number },
	durationSeconds?: number,
) {
	const open = getOpen(habit.id);
	if (!open) return;
	const startMs = new Date(open.start_iso).getTime();
	const end = new Date(startMs + Math.max(0, durationSeconds || 0) * 1000);
	await api.patchEvent(open.calendar_id, open.event_id, {
		end: { dateTime: end.toISOString() },
	});
	clearOpen(habit.id);
}

// --- best-effort entry point called by the API route --------------------------

export async function handleTimerEvent(
	habit: { id: number; description: string },
	event: "start" | "stop",
	durationSeconds?: number,
) {
	const prefs = loadPrefs();
	if (!existsSync(tokenPath) || !prefs.calendarId) return; // silently skip when not set up
	try {
		const g = await buildApi();
		const api: CalendarApi = {
			createEvent: (cal, ev) => g.events.insert({ calendarId: cal, requestBody: ev }),
			patchEvent: (cal, id, patch) =>
				g.events.patch({ calendarId: cal, eventId: id, requestBody: patch }),
		};
		if (event === "start") await startEvent(api, prefs.calendarId, habit, durationSeconds);
		else await stopEvent(api, habit, durationSeconds);
		clearError();
	} catch (e: unknown) {
		recordError(e instanceof Error ? e.message : String(e));
	}
}

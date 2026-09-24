import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import {
	addSession,
	deleteSession,
	deleteSessionsForDate,
	getSessionForDate,
	getSessions,
	getTotalSeconds,
	getValueForDate,
	getWeekDataForAllHabits,
	hasSession,
	setValueForDate,
} from "$lib/server/db";
import { requireUser } from "$lib/server/auth";

export const GET = (async ({ url, request }) => {
	const user = await requireUser(request);
	const habitId = Number(url.searchParams.get("habitId"));
	const startDate = url.searchParams.get("startDate");
	const endDate = url.searchParams.get("endDate");
	const date = url.searchParams.get("date");
	const type = url.searchParams.get("type");

	if (type === "weekdata") {
		const rows = getWeekDataForAllHabits(user.id, startDate, endDate);
		return json({ rows });
	}

	if (type === "value") {
		const val = getValueForDate(habitId, user.id, date);
		return json({ value: val });
	}

	if (type === "seconds") {
		const secs = getTotalSeconds(habitId, user.id, date);
		return json({ durationSeconds: secs });
	}

	if (type === "has") {
		const has = hasSession(habitId, user.id, date);
		return json({ has });
	}

	if (date) {
		const sessions = getSessionForDate(habitId, user.id, date);
		return json(sessions);
	}

	if (startDate && endDate) {
		const sessions = getSessions(habitId, user.id, startDate, endDate);
		return json(sessions);
	}

	// Return all sessions for habit
	const sessions = getSessions(habitId, user.id, "0000-01-01", "9999-12-31");
	return json(sessions);
}) satisfies RequestHandler;

export const POST = (async ({ url, request }) => {
	const user = await requireUser(request);
	const body = await request.json();
	const type = url.searchParams.get("type");

	if (type === "value") {
		setValueForDate(body.habitId, user.id, body.date, body.value);
		return json({ success: true });
	}

	const id = addSession(
		body.habitId,
		user.id,
		body.date,
		body.durationSeconds,
		body.value ?? null,
	);
	return json({ id });
}) satisfies RequestHandler;

export const DELETE = (async ({ url, request }) => {
	const user = await requireUser(request);
	const date = url.searchParams.get("date");
	const habitId = Number(url.searchParams.get("habitId"));
	const sessionId = Number(url.searchParams.get("sessionId"));

	if (sessionId) {
		deleteSession(sessionId, user.id);
	} else if (date) {
		deleteSessionsForDate(habitId, user.id, date);
	}

	return json({ success: true });
}) satisfies RequestHandler;

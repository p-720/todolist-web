// Daily goal reminders: checks every 15min, web-pushes overdue goals at 09:00
// in each subscriber's timezone, once per goal per day.
//
// Standalone module (like ws-server.js): runs outside the SvelteKit bundle,
// opens its own sqlite connection. Keeps its own minimal queries instead of
// importing $lib/server/db.ts (that's TS, compiled into the build). The flake
// ships this file WITHOUT src/, so NO imports from src/ here. Schema and
// goal math must stay in sync with db.ts / src/lib/goal-math.js by hand.
import Database from "better-sqlite3";
import webpush from "web-push";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "pomotasker.db");
const vapidPath = path.join(process.cwd(), "data", "vapid.json");
const VAPID_SUBJECT = "mailto:admin@ug.kyrgyzstan.kg";
const REMIND_HOUR = 9;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

let db;
let timer = null;

function getDb() {
	if (!db) {
		const dir = path.dirname(dbPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
		// users first: the tick below queries it, and this module may boot
		// before the SvelteKit bundle has created anything on a fresh db.
		db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        type TEXT NOT NULL DEFAULT 'text',
        start_value INTEGER,
        target_value INTEGER,
        current_value INTEGER,
        completed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        keys_json TEXT NOT NULL,
        tz_offset_minutes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, endpoint)
      );
      CREATE TABLE IF NOT EXISTS goal_reminders (
        goal_id INTEGER NOT NULL,
        sent_on TEXT NOT NULL,
        PRIMARY KEY (goal_id, sent_on)
      );
      CREATE TABLE IF NOT EXISTS digest_reminders (
        subscription_id INTEGER NOT NULL,
        sent_on TEXT NOT NULL,
        PRIMARY KEY (subscription_id, sent_on)
      );
    `);
		migrateGoals(db);
	}
	return db;
}

// CREATE TABLE IF NOT EXISTS doesn't add columns to pre-existing dbs.
function migrateGoals(d) {
	const cols = d.prepare("PRAGMA table_info(goals)").all();
	if (!cols.some((c) => c.name === "user_id")) {
		// SQLite forbids ADD COLUMN with REFERENCES + non-NULL default, so the
		// legacy column is nullable; the backfill below (and db.ts's migration)
		// fills it, and the app always writes it on insert.
		d.exec("ALTER TABLE goals ADD COLUMN user_id INTEGER REFERENCES users(id)");
	}
	if (!cols.some((c) => c.name === "type")) {
		d.exec("ALTER TABLE goals ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
	}
	for (const col of ["start_value", "target_value", "current_value"]) {
		if (!d.prepare("PRAGMA table_info(goals)").all().some((c) => c.name === col)) {
			d.exec(`ALTER TABLE goals ADD COLUMN ${col} INTEGER`);
		}
	}
	// push_subscriptions: per-user scoping (column added by db.ts for the app;
	// kept here so this module's schema copy never lags behind).
	const subCols = d.prepare("PRAGMA table_info(push_subscriptions)").all();
	if (!subCols.some((c) => c.name === "user_id")) {
		// nullable: same SQLite ADD COLUMN restriction as goals above
		d.exec("ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER REFERENCES users(id)");
	}
	// goal_reminders: dedupe must be per-subscription now (a goal can be
	// overdue for several users). Rebuild the table if the old PK lingers.
	const grCols = d.prepare("PRAGMA table_info(goal_reminders)").all();
	if (!grCols.some((c) => c.name === "subscription_id")) {
		d.exec(`
			CREATE TABLE goal_reminders_new (
				goal_id INTEGER NOT NULL,
				subscription_id INTEGER NOT NULL DEFAULT 0,
				sent_on TEXT NOT NULL,
				PRIMARY KEY (goal_id, subscription_id, sent_on)
			);
			INSERT INTO goal_reminders_new (goal_id, subscription_id, sent_on)
				SELECT goal_id, 0, sent_on FROM goal_reminders;
			DROP TABLE goal_reminders;
			ALTER TABLE goal_reminders_new RENAME TO goal_reminders;
		`);
	}
}

function getVapidKeys() {
	if (existsSync(vapidPath)) {
		return JSON.parse(readFileSync(vapidPath, "utf8"));
	}
	const keys = webpush.generateVAPIDKeys();
	const dir = path.dirname(vapidPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(vapidPath, JSON.stringify(keys, null, 2), { mode: 0o600 });
	return keys;
}

/**
 * Pure scheduling logic: which (subscription, goal) pairs should get the
 * individual overdue action-notification right now. Exported for testing.
 * Strictly overdue (due_date < today); due-today lives in the digest.
 */
export function computeReminderJobs(goals, subscriptions, nowMs) {
	const jobs = [];
	for (const sub of subscriptions) {
		const offset = sub.tz_offset_minutes || 0;
		const local = new Date(nowMs + offset * 60000);
		const localHour = local.getUTCHours();
		if (localHour !== REMIND_HOUR) continue;
		const localDate = local.toISOString().slice(0, 10);
		for (const goal of goals) {
			if (goal.status === "active" && goal.due_date < localDate) {
				jobs.push({ sub, goal, localDate });
			}
		}
	}
	return jobs;
}

export function daysUntil(localDate, dueDate) {
	return Math.round((Date.parse(dueDate) - Date.parse(localDate)) / 86400000);
}

export function daysText(days) {
	if (days > 0) return days === 1 ? "1 day left" : `${days} days left`;
	if (days === 0) return "Due today";
	const n = -days;
	return n === 1 ? "1 day overdue" : `${n} days overdue`;
}

// --- Numbered-goal math (mirror of src/lib/goal-math.js — keep in sync) ---

export function perDay(current, target, dueDate, today) {
	const remaining = Math.abs(target - current);
	if (remaining === 0) return 0;
	const runway = Math.max(1, daysUntil(today, dueDate) + 1);
	return Math.ceil(remaining / runway);
}

function arrowFor(goal) {
	if (goal.target_value > goal.start_value) return "↑";
	if (goal.target_value < goal.start_value) return "↓";
	return "•";
}

export function numberedDigestLine(goal, today) {
	const per = perDay(goal.current_value, goal.target_value, goal.due_date, today);
	return `${goal.title} — ${daysText(daysUntil(today, goal.due_date))} · ${goal.current_value} → ${goal.target_value} ${arrowFor(goal)} · ${per}/day`;
}

export function numberedOverdueBody(goal) {
	const remaining = Math.abs(goal.target_value - goal.current_value);
	if (remaining === 0)
		return `Overdue since ${goal.due_date} — at target, mark it complete`;
	return `Overdue since ${goal.due_date} — ${remaining} left, do ${remaining} today`;
}

function localDateFor(sub, nowMs) {
	const offset = sub.tz_offset_minutes || 0;
	return new Date(nowMs + offset * 60000).toISOString().slice(0, 10);
}

/**
 * Pure scheduling logic: daily 09:00 digest — every active goal, one line
 * each, for every subscription. One notification per subscription per day.
 */
export function computeDigestJobs(goals, subscriptions, nowMs) {
	const jobs = [];
	for (const sub of subscriptions) {
		const offset = sub.tz_offset_minutes || 0;
		const local = new Date(nowMs + offset * 60000);
		if (local.getUTCHours() !== REMIND_HOUR) continue;
		const localDate = local.toISOString().slice(0, 10);
		const lines = goals
			.filter((g) => g.status === "active")
			.sort((a, b) => a.due_date.localeCompare(b.due_date))
			.map((g) =>
				g.type === "numbered"
					? numberedDigestLine(g, localDate)
					: `${g.title} — ${daysText(daysUntil(localDate, g.due_date))}`,
			);
		if (lines.length) jobs.push({ sub, localDate, lines });
	}
	return jobs;
}

function sendPush(subscription, payload) {
	const { publicKey, privateKey } = getVapidKeys();
	try {
		webpush.sendNotification(subscription, payload, {
			vapidDetails: {
				subject: VAPID_SUBJECT,
				publicKey,
				privateKey,
			},
		});
		return true;
	} catch (e) {
		console.error("Push send failed:", e.message);
		return false;
	}
}

export function runGoalReminderTick(nowMs = Date.now()) {
	const d = getDb();
	const owner = d.prepare("SELECT MIN(id) AS id FROM users").get()?.id;
	// Pre-v2 dbs: this module's ALTER may have run before db.ts backfilled
	// user_ids (reminder init fires on boot, db.ts on first request). Backfill
	// to the first user here too — but only when a real user exists:
	// booting a legacy db, users is still empty and a fake id would trip the
	// FK. The next tick (or the first request, which seeds p720) lands it.
	if (owner != null) {
		d.prepare("UPDATE goals SET user_id = ? WHERE user_id IS NULL").run(owner);
		d.prepare("UPDATE push_subscriptions SET user_id = ? WHERE user_id IS NULL").run(owner);
	}
	const goals = d.prepare("SELECT * FROM goals WHERE status = 'active'").all();
	const subs = d.prepare("SELECT * FROM push_subscriptions").all();

	const sent = [];

	// 1. Daily digest: all of the sub's OWN active goals, one per line
	for (const sub of subs) {
		const subGoals = goals.filter((g) => g.user_id === sub.user_id);
		for (const job of computeDigestJobs(subGoals, [sub], nowMs)) {
			const already = d
				.prepare("SELECT 1 FROM digest_reminders WHERE subscription_id = ? AND sent_on = ?")
				.get(job.sub.id, job.localDate);
			if (already) continue;
			const payload = JSON.stringify({
				title: `Goals — ${job.lines.length} active`,
				body: job.lines.join("\n"),
				digest: true,
				user: usernameOf(d, sub.user_id),
			});
			const subObj = { endpoint: job.sub.endpoint, keys: JSON.parse(job.sub.keys_json) };
			if (sendPush(subObj, payload)) {
				d.prepare(
					"INSERT OR IGNORE INTO digest_reminders (subscription_id, sent_on) VALUES (?, ?)",
				).run(job.sub.id, job.localDate);
				sent.push(job);
			}
		}

		// 2. Individual action notifications for the sub's OWN overdue goals
		for (const job of computeReminderJobs(subGoals, [sub], nowMs)) {
			const already = d
				.prepare("SELECT 1 FROM goal_reminders WHERE goal_id = ? AND subscription_id = ? AND sent_on = ?")
				.get(job.goal.id, job.sub.id, job.localDate);
			if (already) continue;
			const body =
				job.goal.type === "numbered"
					? numberedOverdueBody(job.goal)
					: `Overdue since ${job.goal.due_date} — act on it today`;
			const payload = JSON.stringify({
				title: job.goal.title,
				body,
				goalId: job.goal.id,
				user: usernameOf(d, sub.user_id),
			});
			const subObj = { endpoint: job.sub.endpoint, keys: JSON.parse(job.sub.keys_json) };
			if (sendPush(subObj, payload)) {
				d.prepare(
					"INSERT OR IGNORE INTO goal_reminders (goal_id, subscription_id, sent_on) VALUES (?, ?, ?)",
				).run(job.goal.id, job.sub.id, job.localDate);
				sent.push(job);
			}
		}
	}
	return sent;
}

function usernameOf(d, userId) {
	return d.prepare("SELECT username FROM users WHERE id = ?").get(userId)?.username ?? null;
}

export function initGoalReminders() {
	if (timer) return;
	// Run once on startup in case we missed the window, then on interval.
	runGoalReminderTick();
	timer = setInterval(() => runGoalReminderTick(), CHECK_INTERVAL_MS);
	timer.unref?.();
}
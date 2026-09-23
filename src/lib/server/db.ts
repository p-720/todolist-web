import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "pomotasker.db");
let db;

export function getDb() {
	if (!db) {
		const dbDir = path.dirname(dbPath);
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true });
		}
		db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
		initSchema(db);
		migrateGroups(db);
		migrateArchive(db);
		migrateGoalType(db);
	}
	return db;
}

function initSchema(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      timer_duration_seconds INTEGER NOT NULL DEFAULT 1500,
      mode TEXT NOT NULL DEFAULT 'stopwatch',
      habit_type TEXT NOT NULL DEFAULT 'timer',
      min_value INTEGER,
      group_id INTEGER,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT NOT NULL,
      value REAL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_habit_date ON sessions(habit_id, date);

    CREATE TABLE IF NOT EXISTS notes (
      date TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      endpoint TEXT NOT NULL UNIQUE,
      keys_json TEXT NOT NULL,
      tz_offset_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS calendar_open_events (
      habit_id INTEGER PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      start_iso TEXT NOT NULL
    );
  `);
}

function migrateGoalType(db) {
	const cols = db.prepare("PRAGMA table_info(goals)").all();
	if (!cols.some((c) => c.name === "type")) {
		db.exec("ALTER TABLE goals ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
	}
	for (const col of ["start_value", "target_value", "current_value"]) {
		if (!db.prepare("PRAGMA table_info(goals)").all().some((c) => c.name === col)) {
			db.exec(`ALTER TABLE goals ADD COLUMN ${col} INTEGER`);
		}
	}
}

function migrateArchive(db) {
	const cols = db.prepare("PRAGMA table_info(habits)").all();
	const hasArchivedAt = cols.some((c) => c.name === "archived_at");
	if (!hasArchivedAt) {
		db.exec("ALTER TABLE habits ADD COLUMN archived_at TEXT");
	}
}

function migrateGroups(db) {
	// Check if groups table exists (it should due to initSchema, but be safe)
	const groupsTable = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'")
		.get();
	if (!groupsTable) {
		db.exec(`
      CREATE TABLE groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT,
        color TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0
      );
    `);
	}

	// Check if habits.group_id column exists
	const cols = db.prepare("PRAGMA table_info(habits)").all();
	const hasGroupId = cols.some((c) => c.name === "group_id");
	if (!hasGroupId) {
		db.exec("ALTER TABLE habits ADD COLUMN group_id INTEGER");
	}

	// Create default group if none exist
	const defaultGroup = db
		.prepare("SELECT * FROM groups WHERE name = 'General'")
		.get();
	let defaultGroupId;
	if (!defaultGroup) {
		const result = db
			.prepare(
				"INSERT INTO groups (name, order_index, collapsed) VALUES ('General', 0, 0)",
			)
			.run();
		defaultGroupId = result.lastInsertRowid;
	} else {
		defaultGroupId = defaultGroup.id;
	}

	// Assign all ungrouped habits to default group
	const ungrouped = db
		.prepare("SELECT COUNT(*) as cnt FROM habits WHERE group_id IS NULL")
		.get();
	if (ungrouped.cnt > 0) {
		db.prepare("UPDATE habits SET group_id = ? WHERE group_id IS NULL").run(
			defaultGroupId,
		);
	}
}

// --- Groups ---

export function getGroups() {
	const db = getDb();
	return db.prepare("SELECT * FROM groups ORDER BY order_index ASC").all();
}

export function getGroup(id) {
	const db = getDb();
	return db.prepare("SELECT * FROM groups WHERE id = ?").get(id);
}

export function addGroup(name, icon, color) {
	const db = getDb();
	const maxOrder = db
		.prepare("SELECT MAX(order_index) as max FROM groups")
		.get();
	const orderIndex = (maxOrder?.max ?? -1) + 1;
	const result = db
		.prepare(
			"INSERT INTO groups (name, icon, color, order_index, collapsed) VALUES (?, ?, ?, ?, 0)",
		)
		.run(name, icon || null, color || null, orderIndex);
	return result.lastInsertRowid;
}

export function updateGroup(id, name, icon, color) {
	const db = getDb();
	db.prepare(
		"UPDATE groups SET name = ?, icon = ?, color = ? WHERE id = ?",
	).run(name, icon, color, id);
}

export function updateGroupCollapsed(id, collapsed) {
	const db = getDb();
	db.prepare("UPDATE groups SET collapsed = ? WHERE id = ?").run(
		collapsed ? 1 : 0,
		id,
	);
}

export function updateGroupOrder(id, orderIndex) {
	const db = getDb();
	// Shift others to make room
	db.prepare(
		"UPDATE groups SET order_index = order_index + 1 WHERE order_index >= ? AND id != ?",
	).run(orderIndex, id);
	db.prepare("UPDATE groups SET order_index = ? WHERE id = ?").run(
		orderIndex,
		id,
	);
}

export function deleteGroup(id) {
	const db = getDb();
	const defaultGroup = db
		.prepare("SELECT id FROM groups WHERE name = 'General'")
		.get();
	const targetId = defaultGroup?.id ?? id;
	// Move habits to default group
	db.prepare("UPDATE habits SET group_id = ? WHERE group_id = ?").run(
		targetId,
		id,
	);
	db.prepare("DELETE FROM groups WHERE id = ?").run(id);
}

export function getDefaultGroup() {
	const db = getDb();
	return db.prepare("SELECT * FROM groups WHERE name = 'General'").get();
}

// --- Habits ---

export function getAllHabits() {
	const db = getDb();
	return db
		.prepare("SELECT * FROM habits ORDER BY group_id, order_index ASC")
		.all();
}

export function getActiveHabits() {
	const db = getDb();
	return db
		.prepare("SELECT * FROM habits WHERE archived_at IS NULL ORDER BY group_id, order_index ASC")
		.all();
}

export function getHabitsTree() {
	const db = getDb();
	const groups = db
		.prepare("SELECT * FROM groups ORDER BY order_index ASC")
		.all();
	const habits = db
		.prepare("SELECT * FROM habits WHERE archived_at IS NULL ORDER BY group_id, order_index ASC")
		.all();

	const groupMap = new Map();
	for (const g of groups) {
		groupMap.set(g.id, { ...g, habits: [] });
	}
	for (const h of habits) {
		const g = groupMap.get(h.group_id);
		if (g) {
			g.habits.push(h);
		}
	}
	return Array.from(groupMap.values());
}

export function getArchivedHabits() {
	const db = getDb();
	return db
		.prepare(`
			SELECT h.*, g.name as group_name
			FROM habits h
			LEFT JOIN groups g ON h.group_id = g.id
			WHERE h.archived_at IS NOT NULL
			ORDER BY h.archived_at DESC
		`)
		.all();
}

export function addHabit(description, habitType, minValue, groupId) {
	const db = getDb();
	const gid = groupId ?? getDefaultGroup()?.id ?? null;
	const maxOrder = db
		.prepare("SELECT MAX(order_index) as max FROM habits WHERE group_id = ?")
		.get(gid);
	const orderIndex = (maxOrder?.max ?? -1) + 1;
	const result = db
		.prepare(
			"INSERT INTO habits (description, order_index, habit_type, min_value, group_id) VALUES (?, ?, ?, ?, ?)",
		)
		.run(description, orderIndex, habitType, minValue, gid);
	return result.lastInsertRowid;
}

export function updateHabit(id, description, habitType, minValue, groupId) {
	const db = getDb();
	const existing = db.prepare("SELECT * FROM habits WHERE id = ?").get(id);
	const gid = groupId ?? existing?.group_id ?? getDefaultGroup()?.id ?? null;

	// If group changed, append to end of new group
	if (gid !== existing?.group_id) {
		const maxOrder = db
			.prepare(
				"SELECT MAX(order_index) as max FROM habits WHERE group_id = ?",
			)
			.get(gid);
		const newOrder = (maxOrder?.max ?? -1) + 1;
		db.prepare(
			"UPDATE habits SET description = ?, habit_type = ?, min_value = ?, group_id = ?, order_index = ? WHERE id = ?",
		).run(description, habitType, minValue, gid, newOrder, id);
	} else {
		db.prepare(
			"UPDATE habits SET description = ?, habit_type = ?, min_value = ? WHERE id = ?",
		).run(description, habitType, minValue, id);
	}
}

export function updateHabitOrder(id, groupId, orderIndex) {
	const db = getDb();
	// Shift others in target group to make room
	db.prepare(
		"UPDATE habits SET order_index = order_index + 1 WHERE group_id = ? AND order_index >= ? AND id != ?",
	).run(groupId, orderIndex, id);
	db.prepare("UPDATE habits SET group_id = ?, order_index = ? WHERE id = ?").run(
		groupId,
		orderIndex,
		id,
	);
}

export function deleteHabit(id) {
	const db = getDb();
	db.prepare("DELETE FROM habits WHERE id = ?").run(id);
}

export function archiveHabit(id) {
	const db = getDb();
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	db.prepare("UPDATE habits SET archived_at = ? WHERE id = ?").run(now, id);
}

export function unarchiveHabit(id) {
	const db = getDb();
	const habit = db.prepare("SELECT * FROM habits WHERE id = ?").get(id);
	if (!habit) return;
	let gid = habit.group_id;
	// If original group no longer exists, fallback to General
	if (gid) {
		const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(gid);
		if (!group) {
			const general = db.prepare("SELECT id FROM groups WHERE name = 'General'").get();
			gid = general?.id ?? null;
		}
	}
	if (!gid) {
		const general = db.prepare("SELECT id FROM groups WHERE name = 'General'").get();
		gid = general?.id ?? null;
	}
	db.prepare("UPDATE habits SET archived_at = NULL, group_id = ? WHERE id = ?").run(gid, id);
}

export function getHabit(id) {
	const db = getDb();
	return db.prepare("SELECT * FROM habits WHERE id = ?").get(id);
}

// --- Sessions ---

export function getSessions(habitId, startDate, endDate) {
	const db = getDb();
	return db
		.prepare(
			"SELECT * FROM sessions WHERE habit_id = ? AND date >= ? AND date <= ? ORDER BY date",
		)
		.all(habitId, startDate, endDate);
}

export function getSessionForDate(habitId, date) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM sessions WHERE habit_id = ? AND date = ?")
		.all(habitId, date);
}

export function addSession(habitId, date, durationSeconds, value) {
	const db = getDb();
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	const result = db
		.prepare(
			"INSERT INTO sessions (habit_id, date, duration_seconds, completed_at, value) VALUES (?, ?, ?, ?, ?)",
		)
		.run(habitId, date, durationSeconds, now, value);
	return result.lastInsertRowid;
}

export function deleteSession(id) {
	const db = getDb();
	db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function deleteSessionsForDate(habitId, date) {
	const db = getDb();
	db.prepare("DELETE FROM sessions WHERE habit_id = ? AND date = ?").run(
		habitId,
		date,
	);
}

export function getTotalSeconds(habitId, date) {
	const db = getDb();
	const row = db
		.prepare(
			"SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND date = ?",
		)
		.get(habitId, date);
	return row.total;
}

export function hasSession(habitId, date) {
	const db = getDb();
	const row = db
		.prepare(
			"SELECT COUNT(*) as cnt FROM sessions WHERE habit_id = ? AND date = ?",
		)
		.get(habitId, date);
	return row.cnt > 0;
}

export function setValueForDate(habitId, date, value) {
	const db = getDb();
	deleteSessionsForDate(habitId, date);
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	db.prepare(
		"INSERT INTO sessions (habit_id, date, duration_seconds, completed_at, value) VALUES (?, ?, 0, ?, ?)",
	).run(habitId, date, now, value);
}

export function getWeekDataForAllHabits(startDate, endDate) {
	const db = getDb();
	return db
		.prepare(
			"SELECT habit_id, date, COALESCE(SUM(duration_seconds), 0) as duration_seconds, value FROM sessions WHERE date >= ? AND date <= ? GROUP BY habit_id, date ORDER BY habit_id, date",
		)
		.all(startDate, endDate);
}

export function getValueForDate(habitId, date) {
	const db = getDb();
	const row = db
		.prepare(
			"SELECT value FROM sessions WHERE habit_id = ? AND date = ? LIMIT 1",
		)
		.get(habitId, date);
	return row?.value ?? null;
}

// --- Monthly Stats ---

export function getMonthlyMinutes(habitId, month) {
	const db = getDb();
	const row = db
		.prepare(
			"SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND date LIKE ?",
		)
		.get(habitId, `${month}-%`);
	return Math.floor(row.total / 60);
}

export function getMonthlyCompletions(habitId, month) {
	const db = getDb();
	const row = db
		.prepare(
			"SELECT COUNT(DISTINCT date) as cnt FROM sessions WHERE habit_id = ? AND date LIKE ?",
		)
		.get(habitId, `${month}-%`);
	return row.cnt;
}

export function getMonthlyDailyData(habitId, month, daysInMonth, habitType) {
	const db = getDb();
	const daily = [];
	for (let day = 1; day <= daysInMonth; day++) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		switch (habitType) {
			case "timer": {
				const row = db
					.prepare(
						"SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND date = ?",
					)
					.get(habitId, date);
				daily.push(row.total);
				break;
			}
			case "boolean": {
				const row = db
					.prepare(
						"SELECT COUNT(*) as cnt FROM sessions WHERE habit_id = ? AND date = ?",
					)
					.get(habitId, date);
				daily.push(row.cnt > 0 ? 1 : 0);
				break;
			}
			default: {
				const row = db
					.prepare(
						"SELECT COALESCE(SUM(value), 0) as total FROM sessions WHERE habit_id = ? AND date = ?",
					)
					.get(habitId, date);
				daily.push(row.total);
			}
		}
	}
	return daily;
}

export function getStreak(habitId) {
	const db = getDb();
	const rows = db
		.prepare(
			"SELECT DISTINCT date FROM sessions WHERE habit_id = ? ORDER BY date DESC",
		)
		.all(habitId);
	if (rows.length === 0) return 0;

	let streak = 0;
	let current = new Date();
	current.setHours(0, 0, 0, 0);

	for (const row of rows) {
		const rowDate = new Date(row.date + "T00:00:00");
		const diff = Math.floor((current - rowDate) / (1000 * 60 * 60 * 24));
		if (diff === streak) {
			streak++;
			current = new Date(rowDate);
			current.setDate(current.getDate() - 1);
		} else if (diff === 0 && streak === 0) {
			streak = 1;
			current = new Date(rowDate);
			current.setDate(current.getDate() - 1);
		} else {
			break;
		}
	}
	return streak;
}

// --- Week Summary ---

export function getWeekSummary(habitId) {
	const db = getDb();
	const day = new Date();
	const dayOfWeek = (day.getDay() + 6) % 7; // Mon=0
	const monday = new Date(day);
	monday.setDate(day.getDate() - dayOfWeek);
	monday.setHours(0, 0, 0, 0);
	const mondayStr = monday.toISOString().substring(0, 10);

	const rows = db
		.prepare(
			"SELECT date, COUNT(*) as sessionCount, SUM(duration_seconds) as totalSeconds, value FROM sessions WHERE habit_id = ? AND date >= ? GROUP BY date ORDER BY date",
		)
		.all(habitId, mondayStr);

	return rows.map((r) => ({
		date: r.date,
		sessions: r.sessionCount,
		totalSeconds: r.totalSeconds || 0,
		value: r.value,
	}));
}

// --- Notes ---

export function getNote(date) {
	const db = getDb();
	return db.prepare("SELECT * FROM notes WHERE date = ?").get(date);
}

export function getNotesForDates(dates) {
	const db = getDb();
	if (dates.length === 0) return [];
	const placeholders = dates.map(() => "?").join(",");
	return db.prepare(`SELECT * FROM notes WHERE date IN (${placeholders})`).all(...dates);
}

export function setNote(date, content) {
	const db = getDb();
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	if (!content || content.trim() === "") {
		db.prepare("DELETE FROM notes WHERE date = ?").run(date);
		return null;
	}
	const trimmed = content.trim();
	db.prepare(
		"INSERT INTO notes (date, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
	).run(date, trimmed, now);
	return { date, content: trimmed, updated_at: now };
}

// --- Settings ---

function now() {
	return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export function getSetting(key) {
	const db = getDb();
	return db.prepare("SELECT * FROM settings WHERE key = ?").get(key) || null;
}

export function setSetting(key, value) {
	const db = getDb();
	if (!value || value.trim() === "") {
		db.prepare("DELETE FROM settings WHERE key = ?").run(key);
		return null;
	}
	const trimmed = value.trim();
	const ts = now();
	db.prepare(
		"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
	).run(key, trimmed, ts);
	return { key, value: trimmed, updated_at: ts };
}

export function getGoals() {
	const db = getDb();
	return db.prepare("SELECT * FROM goals ORDER BY id DESC").all();
}

export function getGoal(id) {
	const db = getDb();
	return db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
}

export function addGoal(
	title,
	description,
	dueDate,
	type = "text",
	startValue = null,
	targetValue = null,
) {
	const db = getDb();
	const numbered = type === "numbered";
	const result = db
		.prepare(
			"INSERT INTO goals (title, description, due_date, status, type, start_value, target_value, current_value, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)",
		)
		.run(
			title,
			description ?? "",
			dueDate,
			type,
			numbered ? startValue : null,
			numbered ? targetValue : null,
			numbered ? startValue : null,
			now(),
		);
	return result.lastInsertRowid;
}

export function updateGoal(id, { title, description, dueDate, type, startValue, targetValue }) {
	const db = getDb();
	const goal = getGoal(id);
	const t = type === "numbered" ? "numbered" : "text";
	const start = t === "numbered" ? (startValue ?? goal.start_value) : null;
	const target = t === "numbered" ? (targetValue ?? goal.target_value) : null;
	// Changing start resets the counter to the new start (incl. text→numbered);
	// otherwise the live current value is preserved.
	const startChanged =
		t === "numbered" && startValue !== undefined && startValue !== goal.start_value;
	const current = t === "numbered" ? (startChanged ? startValue : goal.current_value ?? start) : null;
	db.prepare(
		"UPDATE goals SET title = ?, description = ?, due_date = ?, type = ?, start_value = ?, target_value = ?, current_value = ? WHERE id = ?",
	).run(
		title ?? goal.title,
		description ?? goal.description,
		dueDate ?? goal.due_date,
		t,
		start,
		target,
		current,
		id,
	);
}

export function updateGoalValue(id, current) {
	const db = getDb();
	db.prepare("UPDATE goals SET current_value = ? WHERE id = ? AND type = 'numbered'").run(
		current,
		id,
	);
}

export function setGoalStatus(id, status) {
	const db = getDb();
	db.prepare(
		"UPDATE goals SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END WHERE id = ?",
	).run(status, status, now(), id);
}

export function deleteGoal(id) {
	const db = getDb();
	db.prepare("DELETE FROM goals WHERE id = ?").run(id);
}

export function getActiveGoals() {
	const db = getDb();
	return db.prepare("SELECT * FROM goals WHERE status = 'active'").all();
}

// --- Push subscriptions ---

export function savePushSubscription(endpoint, keysJson, tzOffsetMinutes) {
	const db = getDb();
	db.prepare(
		"INSERT INTO push_subscriptions (endpoint, keys_json, tz_offset_minutes, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json, tz_offset_minutes = excluded.tz_offset_minutes",
	).run(endpoint, keysJson, tzOffsetMinutes ?? 0, now());
}

export function getPushSubscriptions() {
	const db = getDb();
	return db.prepare("SELECT * FROM push_subscriptions").all();
}

export function deletePushSubscription(endpoint) {
	const db = getDb();
	db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

// --- Goal reminder dedup ---

export function hasGoalReminder(goalId, sentOn) {
	const db = getDb();
	const row = db
		.prepare("SELECT 1 FROM goal_reminders WHERE goal_id = ? AND sent_on = ?")
		.get(goalId, sentOn);
	return !!row;
}

export function addGoalReminder(goalId, sentOn) {
	const db = getDb();
	db.prepare("INSERT OR IGNORE INTO goal_reminders (goal_id, sent_on) VALUES (?, ?)").run(
		goalId,
		sentOn,
	);
}

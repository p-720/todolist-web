import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "pomotasker.db");
let db;

// Default user migrated from the pre-auth single-user DB. Hash of the
// original password (scrypt) — the password itself never lives in code.
// Only ever used when the users table is empty (first boot of an old DB).
const P720_USERNAME = "p720";
const P720_HASH =
	"s2$16384$8$1$as1DXgwaIF8HZowDSTxRAA==$m3I7R8FrwNRtRZnf+J+LcB8flwI/AImc4fenyAB/uwEACuMnYVoBqh1Zoi3ByUd1etBtl0dgHlBy8qlQZhii7Q==";

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
		migrateAuth(db);
		migrateCalendarAuth(db);
	}
	return db;
}

function initSchema(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
      user_id INTEGER NOT NULL,
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
      habit_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      start_iso TEXT NOT NULL,
      PRIMARY KEY (habit_id, user_id)
    );
  `);
}

// --- Auth migration (one-shot, transactional, marker-gated) ------------------
// Runs when an old single-user DB is upgraded: creates users/api_keys, seeds
// p720, adds user_id to every user-scoped table and backfills all existing
// rows to p720. sessions inherit ownership through habits (no column).

function hasCol(table, col) {
	return db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.some((c) => c.name === col);
}

function metaGet(key) {
	return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value;
}

function migrateAuth(db_) {
	if (metaGet("schema_version") === "2") return;

	db.exec("BEGIN");
	try {
		// The first registered user owns the legacy data (in a fresh
		// deploy that's p720, seeded below when no users exist yet).
		let ownerId = db
			.prepare("SELECT MIN(id) as id FROM users")
			.get()?.id;
		if (!ownerId) {
			ownerId = db
					.prepare(
						"INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
					)
					.run(
						P720_USERNAME,
						P720_HASH,
						"2026-01-01 00:00:00",
					)
					.lastInsertRowid;
		}

		// groups: old UNIQUE(name) is a table constraint -> rebuild
		if (!hasCol("groups", "user_id")) {
			db.exec(`
          CREATE TABLE groups_mig (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            order_index INTEGER NOT NULL DEFAULT 0,
            collapsed INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, name)
          );`);
			db
				.prepare(
					`INSERT INTO groups_mig (id, user_id, name, icon, color, order_index, collapsed)
               SELECT id, ?, name, icon, color, order_index, collapsed FROM groups`,
				)
				.run(ownerId);
			db.exec("DROP TABLE groups; ALTER TABLE groups_mig RENAME TO groups;");
		}
		// ponytail: better-sqlite3 exec() takes no params — ? would bind NULL.
		db.prepare(`UPDATE groups SET user_id = ? WHERE user_id IS NULL`).run(ownerId);
		if (hasCol("habits", "user_id")) {
			// already migrated columns — still backfill any NULLs defensively
			db.prepare(`UPDATE habits SET user_id = ? WHERE user_id IS NULL`).run(ownerId);
		} else {
			db.exec("ALTER TABLE habits ADD COLUMN user_id INTEGER");
			db.prepare(`UPDATE habits SET user_id = ?`).run(ownerId);
		}

		// notes: old PK (date) -> (user_id, date)
		const notesPk = db
			.prepare(`PRAGMA table_info(notes)`)
			.all()
			.filter((c) => c.pk > 0)
			.map((c) => c.name)
			.join(",");
		if (notesPk !== "user_id,date") {
			if (!hasCol("notes", "user_id")) {
				db.exec("ALTER TABLE notes ADD COLUMN user_id INTEGER");
			}
			db.exec(`
        CREATE TABLE notes_mig (
          user_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, date)
        );`);
			db
				.prepare(
					`INSERT INTO notes_mig (user_id, date, content, updated_at)
          SELECT ?, date, content, updated_at FROM notes`,
				)
				.run(ownerId);
			db.exec("DROP TABLE notes; ALTER TABLE notes_mig RENAME TO notes;");
		}

		// settings: old PK (key) -> (user_id, key)
		const settingsPk = db
			.prepare(`PRAGMA table_info(settings)`)
			.all()
			.filter((c) => c.pk > 0)
			.map((c) => c.name)
			.join(",");
		if (settingsPk !== "user_id,key") {
			if (!hasCol("settings", "user_id")) {
				db.exec("ALTER TABLE settings ADD COLUMN user_id INTEGER");
			}
			db.exec(`
        CREATE TABLE settings_mig (
          user_id INTEGER NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        );`);
			db
				.prepare(
					`INSERT INTO settings_mig (user_id, key, value, updated_at)
          SELECT ?, key, value, updated_at FROM settings`,
				)
				.run(ownerId);
			db.exec("DROP TABLE settings; ALTER TABLE settings_mig RENAME TO settings;");
		}

		// goals, push_subscriptions: add column + backfill
		if (!hasCol("goals", "user_id")) {
			db.exec("ALTER TABLE goals ADD COLUMN user_id INTEGER");
		}
		db
			.prepare(`UPDATE goals SET user_id = ? WHERE user_id IS NULL OR user_id = 0`)
			.run(ownerId);
		if (!hasCol("push_subscriptions", "user_id")) {
			db.exec("ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER");
		}
		db
			.prepare(
				`UPDATE push_subscriptions SET user_id = ? WHERE user_id IS NULL OR user_id = 0`,
			)
			.run(ownerId);

				db.exec(
			`INSERT INTO meta (key, value) VALUES ('schema_version', '2')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		);
		db.exec("COMMIT");
	} catch (e) {
		db.exec("ROLLBACK");
		throw e;
	}
}


// --- Per-user Google Calendar (idempotent, runs every boot) ------------------
// Separate from the marker-gated migrateAuth on purpose: prod DBs are already
// at schema v2, so a v2-gated step would never run. Every step is a no-op
// once done.
function migrateCalendarAuth(db_) {
	const ownerId = db_.prepare("SELECT MIN(id) as id FROM users").get()?.id;
	const openPks = db_
		.prepare("PRAGMA table_info(calendar_open_events)")
		.all()
		.filter((c) => c.pk > 0)
		.map((c) => c.name)
		.sort()
		.join(",");
	if (openPks !== "habit_id,user_id") {
		if (!hasCol("calendar_open_events", "user_id")) {
			db_.exec("ALTER TABLE calendar_open_events ADD COLUMN user_id INTEGER");
		}
		// open events belong to the owning habit's user
		db_
			.prepare(
				"UPDATE calendar_open_events SET user_id = (SELECT user_id FROM habits h WHERE h.id = calendar_open_events.habit_id) WHERE user_id IS NULL",
			)
			.run();
		db_.exec(`
      CREATE TABLE calendar_open_events_mig (
        habit_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        calendar_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        start_iso TEXT NOT NULL,
        PRIMARY KEY (habit_id, user_id)
      );`);
		db_
			.prepare(
				"INSERT INTO calendar_open_events_mig (habit_id, user_id, calendar_id, event_id, start_iso) SELECT habit_id, user_id, calendar_id, event_id, start_iso FROM calendar_open_events WHERE user_id IS NOT NULL",
			)
			.run();
		db_.exec(
			"DROP TABLE calendar_open_events; ALTER TABLE calendar_open_events_mig RENAME TO calendar_open_events;",
		);
	}

	db_.exec(`
    CREATE TABLE IF NOT EXISTS calendar_creds (
      user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      token TEXT,
      calendar_id TEXT,
      calendar_name TEXT,
      last_error TEXT,
      last_error_at TEXT
    );`);

	// Pre-auth, the Google integration was ONE global account in data/*.json,
	// used by p720. Adopt the files into the legacy owner's row (first user).
	if (ownerId && !db_.prepare("SELECT 1 FROM calendar_creds WHERE user_id = ?").get(ownerId)) {
		const dataDir = path.dirname(dbPath);
		const file = (name) => {
			try {
				return JSON.parse(readFileSync(path.join(dataDir, name), "utf8"));
			} catch {
				return null;
			}
		};
		const creds = file("google-oauth.json");
		const token = file("google-token.json");
		const prefs = file("calendar-prefs.json");
		if (creds || token || prefs) {
			db_
				.prepare(
					`INSERT INTO calendar_creds (user_id, client_id, client_secret, token, calendar_id, calendar_name, last_error, last_error_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					ownerId,
					creds?.client_id || "",
					creds?.client_secret || "",
					token ? JSON.stringify(token) : null,
					prefs?.calendarId || null,
					prefs?.calendarName || null,
					prefs?.lastError || null,
					prefs?.lastErrorAt || null,
				);
			console.log(`[migrate] adopted legacy global google calendar into user ${ownerId}`);
		}
	}
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
}

// --- Groups ---

export function getGroups(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM groups WHERE user_id = ? ORDER BY order_index ASC")
		.all(userId);
}

export function getGroup(id, userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM groups WHERE id = ? AND user_id = ?")
		.get(id, userId);
}

export function addGroup(userId, name, icon, color) {
	const db = getDb();
	const maxOrder = db
		.prepare("SELECT MAX(order_index) as max FROM groups WHERE user_id = ?")
		.get(userId);
	const orderIndex = (maxOrder?.max ?? -1) + 1;
	const result = db
		.prepare(
			"INSERT INTO groups (user_id, name, icon, color, order_index, collapsed) VALUES (?, ?, ?, ?, ?, 0)",
		)
		.run(userId, name, icon || null, color || null, orderIndex);
	return result.lastInsertRowid;
}

export function updateGroup(id, userId, name, icon, color) {
	const db = getDb();
	db.prepare(
		"UPDATE groups SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?",
	).run(name, icon, color, id, userId);
}

export function updateGroupCollapsed(id, userId, collapsed) {
	const db = getDb();
	db.prepare("UPDATE groups SET collapsed = ? WHERE id = ? AND user_id = ?").run(
		collapsed ? 1 : 0,
		id,
		userId,
	);
}

export function updateGroupOrder(id, userId, orderIndex) {
	const db = getDb();
	// Shift others to make room
	db.prepare(
		"UPDATE groups SET order_index = order_index + 1 WHERE user_id = ? AND order_index >= ? AND id != ?",
	).run(userId, orderIndex, id);
	db.prepare("UPDATE groups SET order_index = ? WHERE id = ? AND user_id = ?").run(
		orderIndex,
		id,
		userId,
	);
}

export function deleteGroup(id, userId) {
	const db = getDb();
	const defaultGroup = getDefaultGroup(userId);
	const targetId = defaultGroup?.id ?? id;
	// Move habits to default group
	db.prepare(
		"UPDATE habits SET group_id = ? WHERE group_id = ? AND user_id = ?",
	).run(targetId, id, userId);
	db.prepare("DELETE FROM groups WHERE id = ? AND user_id = ?").run(id, userId);
}

export function getDefaultGroup(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM groups WHERE user_id = ? AND name = 'General'")
		.get(userId);
}

/** Every user gets a 'General' group (old single-user behavior, per user). */
export function ensureDefaultGroup(userId) {
	const db = getDb();
	const g = getDefaultGroup(userId);
	if (g) return g;
	const result = db
		.prepare(
			"INSERT INTO groups (user_id, name, order_index, collapsed) VALUES (?, 'General', 0, 0)",
		)
		.run(userId);
	return db.prepare("SELECT * FROM groups WHERE id = ?").get(result.lastInsertRowid);
}

// --- Habits ---

export function getAllHabits(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM habits WHERE user_id = ? ORDER BY group_id, order_index ASC")
		.all(userId);
}

export function getActiveHabits(userId) {
	const db = getDb();
	return db
		.prepare(
			"SELECT * FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY group_id, order_index ASC",
		)
		.all(userId);
}

export function getHabitsTree(userId) {
	const db = getDb();
	ensureDefaultGroup(userId);
	const groups = db
		.prepare("SELECT * FROM groups WHERE user_id = ? ORDER BY order_index ASC")
		.all(userId);
	const habits = db
		.prepare(
			"SELECT * FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY group_id, order_index ASC",
		)
		.all(userId);

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

export function getArchivedHabits(userId) {
	const db = getDb();
	return db
		.prepare(`
			SELECT h.*, g.name as group_name
			FROM habits h
			LEFT JOIN groups g ON h.group_id = g.id
			WHERE h.user_id = ? AND h.archived_at IS NOT NULL
			ORDER BY h.archived_at DESC
		`)
		.all(userId);
}

export function addHabit(userId, description, habitType, minValue, groupId) {
	const db = getDb();
	let gid = null;
	if (groupId != null && getGroup(groupId, userId)) gid = groupId;
	if (!gid) gid = ensureDefaultGroup(userId).id;
	const maxOrder = db
		.prepare("SELECT MAX(order_index) as max FROM habits WHERE user_id = ? AND group_id = ?")
		.get(userId, gid);
	const orderIndex = (maxOrder?.max ?? -1) + 1;
	const result = db
		.prepare(
			"INSERT INTO habits (user_id, description, order_index, habit_type, min_value, group_id) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run(userId, description, orderIndex, habitType, minValue, gid);
	return result.lastInsertRowid;
}

export function updateHabit(id, userId, description, habitType, minValue, groupId) {
	const db = getDb();
	const existing = getHabit(id, userId);
	if (!existing) return;
	const gid =
		groupId ??
		existing.group_id ??
		ensureDefaultGroup(userId).id;

	// If group changed, append to end of new group
	if (gid !== existing.group_id) {
		const maxOrder = db
			.prepare(
				"SELECT MAX(order_index) as max FROM habits WHERE user_id = ? AND group_id = ?",
			)
			.get(userId, gid);
		const newOrder = (maxOrder?.max ?? -1) + 1;
		db.prepare(
			"UPDATE habits SET description = ?, habit_type = ?, min_value = ?, group_id = ?, order_index = ? WHERE id = ? AND user_id = ?",
		).run(description, habitType, minValue, gid, newOrder, id, userId);
	} else {
		db.prepare(
			"UPDATE habits SET description = ?, habit_type = ?, min_value = ? WHERE id = ? AND user_id = ?",
		).run(description, habitType, minValue, id, userId);
	}
}

export function updateHabitOrder(id, userId, groupId, orderIndex) {
	const db = getDb();
	// Shift others in target group to make room
	db.prepare(
		"UPDATE habits SET order_index = order_index + 1 WHERE user_id = ? AND group_id = ? AND order_index >= ? AND id != ?",
	).run(userId, groupId, orderIndex, id);
	db.prepare(
		"UPDATE habits SET group_id = ?, order_index = ? WHERE id = ? AND user_id = ?",
	).run(groupId, orderIndex, id, userId);
}

export function deleteHabit(id, userId) {
	const db = getDb();
	db.prepare("DELETE FROM habits WHERE id = ? AND user_id = ?").run(id, userId);
}

export function archiveHabit(id, userId) {
	const db = getDb();
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	db.prepare("UPDATE habits SET archived_at = ? WHERE id = ? AND user_id = ?").run(
		now,
		id,
		userId,
	);
}

export function unarchiveHabit(id, userId) {
	const db = getDb();
	const habit = getHabit(id, userId);
	if (!habit) return;
	let gid = habit.group_id;
	// If original group no longer exists, fallback to General
	if (gid) {
		const group = getGroup(gid, userId);
		if (!group) {
			gid = ensureDefaultGroup(userId).id;
		}
	} else {
		gid = ensureDefaultGroup(userId).id;
	}
	db.prepare("UPDATE habits SET archived_at = NULL, group_id = ? WHERE id = ? AND user_id = ?").run(
		gid,
		id,
		userId,
	);
}

export function getHabit(id, userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM habits WHERE id = ? AND user_id = ?")
		.get(id, userId);
}

// --- Sessions (ownership via habits join — no user_id column needed) --------

const OWNED_HABIT = "EXISTS (SELECT 1 FROM habits h WHERE h.id = sessions.habit_id AND h.user_id = ?)";

export function getSessions(habitId, userId, startDate, endDate) {
	const db = getDb();
	return db
		.prepare(
			`SELECT * FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date >= ? AND date <= ? ORDER BY date`,
		)
		.all(habitId, userId, startDate, endDate);
}

export function getSessionForDate(habitId, userId, date) {
	const db = getDb();
	return db
		.prepare(`SELECT * FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`)
		.all(habitId, userId, date);
}

export function addSession(habitId, userId, date, durationSeconds, value) {
	const db = getDb();
	if (!getHabit(habitId, userId)) return null;
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	const result = db
		.prepare(
			"INSERT INTO sessions (habit_id, date, duration_seconds, completed_at, value) VALUES (?, ?, ?, ?, ?)",
		)
		.run(habitId, date, durationSeconds, now, value);
	return result.lastInsertRowid;
}

export function deleteSession(id, userId) {
	const db = getDb();
	db.prepare(`DELETE FROM sessions WHERE id = ? AND ${OWNED_HABIT}`).run(id, userId);
}

export function deleteSessionsForDate(habitId, userId, date) {
	const db = getDb();
	db.prepare(
		`DELETE FROM sessions WHERE habit_id = ? AND date = ? AND ${OWNED_HABIT}`,
	).run(habitId, date, userId);
}

export function getTotalSeconds(habitId, userId, date) {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`,
		)
		.get(habitId, userId, date);
	return row.total;
}

export function hasSession(habitId, userId, date) {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT COUNT(*) as cnt FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`,
		)
		.get(habitId, userId, date);
	return row.cnt > 0;
}

export function setValueForDate(habitId, userId, date, value) {
	const db = getDb();
	deleteSessionsForDate(habitId, userId, date);
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	db.prepare(
		"INSERT INTO sessions (habit_id, date, duration_seconds, completed_at, value) VALUES (?, ?, 0, ?, ?)",
	).run(habitId, date, now, value);
}

export function getWeekDataForAllHabits(userId, startDate, endDate) {
	const db = getDb();
	return db
		.prepare(
			`SELECT s.habit_id, s.date, COALESCE(SUM(duration_seconds), 0) as duration_seconds, s.value
       FROM sessions s JOIN habits h ON h.id = s.habit_id
       WHERE h.user_id = ? AND s.date >= ? AND s.date <= ?
       GROUP BY s.habit_id, s.date ORDER BY s.habit_id, s.date`,
		)
		.all(userId, startDate, endDate);
}

export function getValueForDate(habitId, userId, date) {
	const db = getDb();
	const row = db
		.prepare(`SELECT value FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ? LIMIT 1`)
		.get(habitId, userId, date);
	return row?.value ?? null;
}

// --- Monthly Stats ---

export function getMonthlyMinutes(habitId, userId, month) {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date LIKE ?`,
		)
		.get(habitId, userId, `${month}-%`);
	return Math.floor(row.total / 60);
}

export function getMonthlyCompletions(habitId, userId, month) {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT COUNT(DISTINCT date) as cnt FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date LIKE ?`,
		)
		.get(habitId, userId, `${month}-%`);
	return row.cnt;
}

export function getMonthlyDailyData(habitId, userId, month, daysInMonth, habitType) {
	const db = getDb();
	const daily = [];
	for (let day = 1; day <= daysInMonth; day++) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		switch (habitType) {
			case "timer": {
				const row = db
					.prepare(
						`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`,
					)
					.get(habitId, userId, date);
				daily.push(row.total);
				break;
			}
			case "boolean": {
				const row = db
					.prepare(
						`SELECT COUNT(*) as cnt FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`,
					)
					.get(habitId, userId, date);
				daily.push(row.cnt > 0 ? 1 : 0);
				break;
			}
			default: {
				const row = db
					.prepare(
						`SELECT COALESCE(SUM(value), 0) as total FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date = ?`,
					)
					.get(habitId, userId, date);
				daily.push(row.total);
			}
		}
	}
	return daily;
}

export function getStreak(habitId, userId) {
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT DISTINCT date FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} ORDER BY date DESC`,
		)
		.all(habitId, userId);
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

export function getWeekSummary(habitId, userId) {
	const db = getDb();
	const day = new Date();
	const dayOfWeek = (day.getDay() + 6) % 7; // Mon=0
	const monday = new Date(day);
	monday.setDate(day.getDate() - dayOfWeek);
	monday.setHours(0, 0, 0, 0);
	const mondayStr = monday.toISOString().substring(0, 10);

	const rows = db
		.prepare(
			`SELECT date, COUNT(*) as sessionCount, SUM(duration_seconds) as totalSeconds, value
       FROM sessions WHERE habit_id = ? AND ${OWNED_HABIT} AND date >= ?
       GROUP BY date ORDER BY date`,
		) 
		.all(habitId, userId, mondayStr);

	return rows.map((r) => ({
		date: r.date,
		sessions: r.sessionCount,
		totalSeconds: r.totalSeconds || 0,
		value: r.value,
	}));
}

// --- Notes ---

export function getNote(userId, date) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM notes WHERE user_id = ? AND date = ?")
		.get(userId, date);
}

export function getNotesForDates(userId, dates) {
	const db = getDb();
	if (dates.length === 0) return [];
	const placeholders = dates.map(() => "?").join(",");
	return db
		.prepare(`SELECT * FROM notes WHERE user_id = ? AND date IN (${placeholders})`)
		.all(userId, ...dates);
}

export function setNote(userId, date, content) {
	const db = getDb();
	const now = new Date().toISOString().replace("T", " ").substring(0, 19);
	if (!content || content.trim() === "") {
		db.prepare("DELETE FROM notes WHERE user_id = ? AND date = ?").run(userId, date);
		return null;
	}
	const trimmed = content.trim();
	db.prepare(
		"INSERT INTO notes (user_id, date, content, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
	).run(userId, date, trimmed, now);
	return { date, content: trimmed, updated_at: now };
}

// --- Settings ---

function now() {
	return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export function getSetting(userId, key) {
	const db = getDb();
	return (
		db
			.prepare("SELECT * FROM settings WHERE user_id = ? AND key = ?")
			.get(userId, key) || null
	);
}

export function setSetting(userId, key, value) {
	const db = getDb();
	if (!value || value.trim() === "") {
		db.prepare("DELETE FROM settings WHERE user_id = ? AND key = ?").run(userId, key);
		return null;
	}
	const trimmed = value.trim();
	const ts = now();
	db.prepare(
		"INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
	).run(userId, key, trimmed, ts);
	return { key, value: trimmed, updated_at: ts };
}

export function getGoals(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC")
		.all(userId);
}

export function getGoal(id, userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?")
		.get(id, userId);
}

export function addGoal(
	userId,
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
			"INSERT INTO goals (user_id, title, description, due_date, status, type, start_value, target_value, current_value, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)",
		)
		.run(
			userId,
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

export function updateGoal(id, userId, { title, description, dueDate, type, startValue, targetValue }) {
	const db = getDb();
	const goal = getGoal(id, userId);
	if (!goal) return;
	const t = type === "numbered" ? "numbered" : "text";
	const start = t === "numbered" ? (startValue ?? goal.start_value) : null;
	const target = t === "numbered" ? (targetValue ?? goal.target_value) : null;
	// Changing start resets the counter to the new start (incl. text→numbered);
	// otherwise the live current value is preserved.
	const startChanged =
		t === "numbered" && startValue !== undefined && startValue !== goal.start_value;
	const current = t === "numbered" ? (startChanged ? startValue : goal.current_value ?? start) : null;
	db.prepare(
		"UPDATE goals SET title = ?, description = ?, due_date = ?, type = ?, start_value = ?, target_value = ?, current_value = ? WHERE id = ? AND user_id = ?",
	).run(
		title ?? goal.title,
		description ?? goal.description,
		dueDate ?? goal.due_date,
		t,
		start,
		target,
		current,
		id,
		userId,
	);
}

export function updateGoalValue(id, userId, current) {
	const db = getDb();
	db.prepare(
		"UPDATE goals SET current_value = ? WHERE id = ? AND user_id = ? AND type = 'numbered'",
	).run(current, id, userId);
}

export function setGoalStatus(id, userId, status) {
	const db = getDb();
	db.prepare(
		"UPDATE goals SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END WHERE id = ? AND user_id = ?",
	).run(status, status, now(), id, userId);
}

export function deleteGoal(id, userId) {
	const db = getDb();
	db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(id, userId);
}

export function getActiveGoals(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active'")
		.all(userId);
}

// --- Push subscriptions ---

export function savePushSubscription(userId, endpoint, keysJson, tzOffsetMinutes) {
	const db = getDb();
	db.prepare(
		"INSERT INTO push_subscriptions (user_id, endpoint, keys_json, tz_offset_minutes, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json, tz_offset_minutes = excluded.tz_offset_minutes",
	).run(userId, endpoint, keysJson, tzOffsetMinutes ?? 0, now());
}

export function getPushSubscriptions(userId) {
	const db = getDb();
	return db
		.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?")
		.all(userId);
}

export function deletePushSubscription(userId, endpoint) {
	const db = getDb();
	db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(
		userId,
		endpoint,
	);
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

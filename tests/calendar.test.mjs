// Open-event lifecycle checks: run with `node tests/calendar.test.mjs`
// Covers: create on start, orphan closed on next start, end patched on stop, no-op without open event.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// db.ts resolves data/ + pomotasker.db from process.cwd() at import time
process.chdir(mkdtempSync(path.join(tmpdir(), "pomotasker-cal-")));

const { startEvent, stopEvent } = await import("../src/lib/server/calendar.ts");

const created = [];
const patched = [];
const api = {
	async createEvent(cal, ev) {
		const id = "evt" + (created.length + 1);
		created.push({ cal, ev, id });
		return { id };
	},
	async patchEvent(cal, id, patch) {
		patched.push({ cal, id, patch });
	},
};

const habit = { id: 7, description: "Read book" };

// 1. start → event created (no end), open row recorded
await startEvent(api, "cal-main", habit);
assert.equal(created.length, 1);
assert.equal(created[0].cal, "cal-main");
assert.equal(created[0].ev.summary, "Read book");
assert.ok(created[0].ev.start.dateTime);
assert.equal(created[0].ev.end, undefined);
assert.equal(patched.length, 0);

// 2. start again without stopping → orphan closed (end patched), new event created
await startEvent(api, "cal-main", habit);
assert.equal(created.length, 2);
assert.equal(patched.length, 1);
assert.equal(patched[0].id, "evt1");
assert.ok(patched[0].patch.end.dateTime);

// 3. stop with actual elapsed → end = start + 90s, open row cleared
const startIso = created[1].ev.start.dateTime;
await stopEvent(api, habit, 90);
assert.equal(patched.length, 2);
assert.equal(patched[1].id, "evt2");
const expectedEnd = new Date(new Date(startIso).getTime() + 90 * 1000).toISOString();
assert.equal(patched[1].patch.end.dateTime, expectedEnd);

// 4. stop with no open event → no-op
const before = patched.length;
await stopEvent(api, habit);
assert.equal(patched.length, before);

// 5. stop of a habit that never started → no-op
await stopEvent(api, { id: 99 }, 30);
assert.equal(patched.length, before);

// 6. zero-duration stop → end == start (valid, not in the past)
await startEvent(api, "cal-main", habit);
await stopEvent(api, habit, 0);
const last = patched[patched.length - 1];
assert.equal(last.patch.end.dateTime, created[2].ev.start.dateTime);

console.log("calendar.test.mjs: all checks passed");

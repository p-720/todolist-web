// Open-event lifecycle checks: run with `node tests/calendar.test.mjs`
// Covers: create on start (provisional end — Google requires one), orphan closed on next start,
// end patched on stop, provisional honors duration hint (min 60s), no-op without open event.
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

const iso = (d) => d.toISOString();

// 1. start → event created with a 1-minute provisional end, open row recorded
await startEvent(api, "cal-main", { id: 7, description: "Read book" });
assert.equal(created.length, 1);
assert.equal(created[0].cal, "cal-main");
assert.equal(created[0].ev.summary, "Read book");
assert.ok(created[0].ev.start.dateTime);
assert.ok(created[0].ev.end.dateTime);
assert.equal(
	new Date(created[0].ev.end.dateTime).getTime() - new Date(created[0].ev.start.dateTime).getTime(),
	60 * 1000,
);
assert.equal(patched.length, 0);

// 1b. a duration hint is ignored at start (always 1-minute provisional)
await startEvent(api, "cal-main", { id: 8, description: "Timed" }, 1500);
assert.equal(
	new Date(created[1].ev.end.dateTime).getTime() - new Date(created[1].ev.start.dateTime).getTime(),
	60 * 1000,
);
// zero-elapsed stop → end == start
await stopEvent(api, { id: 8 });
assert.equal(patched[0].id, "evt2");
assert.equal(patched[0].patch.end.dateTime, iso(new Date(created[1].ev.start.dateTime)));

// 2. start habit 7 again without stopping → orphan closed (end patched), new event created
await startEvent(api, "cal-main", { id: 7, description: "Read book" });
assert.equal(created.length, 3);
assert.equal(patched[1].id, "evt1");
assert.ok(patched[1].patch.end.dateTime);

// 3. stop with actual elapsed → end = start + 90s, open row cleared
const s3 = new Date(created[2].ev.start.dateTime);
await stopEvent(api, { id: 7 }, 90);
assert.equal(patched[2].id, "evt3");
assert.equal(patched[2].patch.end.dateTime, iso(new Date(s3.getTime() + 90 * 1000)));

// 4. stop with no open event → no-op
const before = patched.length;
await stopEvent(api, { id: 7 });
assert.equal(patched.length, before);

// 5. stop of a habit that never started → no-op
await stopEvent(api, { id: 99 }, 30);
assert.equal(patched.length, before);

console.log("calendar.test.mjs: all checks passed");

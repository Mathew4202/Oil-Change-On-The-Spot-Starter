import { test } from "node:test";
import assert from "node:assert/strict";
import { dueNudge, timeWords } from "../hold-nudge-plan.ts";

const now = new Date("2026-11-03T15:00:00Z");   // 11:00 am Halifax
const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
const later = (m: number) => new Date(now.getTime() + m * 60000).toISOString();
const hold = (createdMinAgo: number, extra: object = {}) => ({ status: "held", booking_id: null, starts_at: later(120), expires_at: later(60), created_at: ago(createdMinAgo), ...extra });

test("one reminder, 30 minutes after the hold", () => {
  assert.equal(dueNudge(hold(10), now, [], 11), null);
  assert.equal(dueNudge(hold(31), now, [], 11), 1);
  assert.equal(dueNudge(hold(45), now, [1], 11), null);
  assert.equal(dueNudge(hold(61), now, [1], 11), null);           // only one reminder now
  assert.equal(dueNudge(hold(70), now, [1, 2], 11), null);
});

test("no reminder once they booked, the hold ended, the job is close, or at night", () => {
  assert.equal(dueNudge(hold(31, { status: "booked" }), now, [], 11), null);
  assert.equal(dueNudge(hold(31, { expires_at: ago(1) }), now, [], 11), null);
  assert.equal(dueNudge(hold(31, { starts_at: later(10) }), now, [], 11), null);
  assert.equal(dueNudge(hold(31), now, [], 22), null);
  assert.equal(dueNudge(hold(200), now, [], 11), null);
});

test("the time reads naturally", () => {
  assert.equal(timeWords("2026-11-03", "2026-11-03", "1:00 pm", "Tue, Nov 3 at 1:00 pm"), "1:00 pm");
  assert.equal(timeWords("2026-11-04", "2026-11-03", "1:00 pm", "Wed, Nov 4 at 1:00 pm"), "tomorrow at 1:00 pm");
  assert.equal(timeWords("2026-11-06", "2026-11-03", "1:00 pm", "Fri, Nov 6 at 1:00 pm"), "Fri, Nov 6 at 1:00 pm");
});

import { soonDue } from "../hold-nudge-plan.ts";
test("the 2-hours-before text: only around 2 hours out, in the daytime, not right after booking", () => {
  const b = (minsOut: number, bookedHoursAgo = 30, status = "confirmed") => ({ starts_at: later(minsOut), created_at: ago(bookedHoursAgo * 60), status });
  assert.equal(soonDue(b(120), now, 11), true);
  assert.equal(soonDue(b(60), now, 11), false);
  assert.equal(soonDue(b(180), now, 11), false);
  assert.equal(soonDue(b(120, 1), now, 11), false);           // booked an hour ago
  assert.equal(soonDue(b(120, 30, "cancelled"), now, 11), false);
  assert.equal(soonDue(b(120), now, 7), false);                // before 8 am
});

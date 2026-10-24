import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsForDay, halifaxToDate, halifaxDate } from "../slots.ts";

const at = (s: string) => new Date(s);
const yesterday = at("2026-10-23T12:00:00-03:00");

test("Halifax time handles daylight saving (ends Nov 1, 2026)", () => {
  assert.equal(halifaxToDate("2026-10-31", 13 * 60 + 30).toISOString(), "2026-10-31T16:30:00.000Z"); // ADT, UTC-3
  assert.equal(halifaxToDate("2026-11-01", 13 * 60 + 30).toISOString(), "2026-11-01T17:30:00.000Z"); // AST, UTC-4
});

test("'today' is Halifax's date, not UTC's (11:30 pm Friday is still Friday)", () => {
  assert.equal(halifaxDate(at("2026-10-24T02:30:00Z")), "2026-10-23");
});

test("Saturday with nothing booked: every half hour from 10:00 am to 10:00 pm", () => {
  const r = slotsForDay({ date: "2026-10-24", now: yesterday, busy: [] });
  assert.equal(r.slots.length, 25);
  assert.equal(r.slots[0].label, "10:00 am");
  assert.equal(r.slots.at(-1)!.label, "10:00 pm");
});

test("a booking at 12:00 blocks the full 1 h 15 min, and nobody can overlap it", () => {
  const busy = [{ start: halifaxToDate("2026-10-24", 720), end: halifaxToDate("2026-10-24", 795) }];
  const times = slotsForDay({ date: "2026-10-24", now: yesterday, busy }).slots.map((s) => s.time);
  for (const gone of ["11:00", "11:30", "12:00", "12:30", "13:00"]) assert.ok(!times.includes(gone), gone);
  assert.ok(times.includes("10:30"));   // 10:30 to 11:45, finishes before 12:00
  assert.ok(times.includes("13:30"));   // starts after 1:15
});

test("same day needs 2 hours notice", () => {
  const r = slotsForDay({ date: "2026-10-24", now: at("2026-10-24T10:05:00-03:00"), busy: [] });
  assert.equal(r.slots[0].label, "12:30 pm");
});

test("public holiday: no same-day booking unless the filter is in stock", () => {
  const now = at("2026-11-11T08:00:00-04:00");
  const holidays = ["2026-11-11"];
  assert.equal(slotsForDay({ date: "2026-11-11", now, busy: [], partsClosedDates: holidays }).open, false);
  assert.equal(slotsForDay({ date: "2026-11-11", now, busy: [], partsClosedDates: holidays, needsPartsRun: false }).open, true);
  assert.equal(slotsForDay({ date: "2026-11-11", now: yesterday, busy: [], partsClosedDates: holidays }).open, true); // booked ahead is fine
});

test("two cars take 2 x 1 h 15 min", () => {
  const busy = [{ start: halifaxToDate("2026-10-24", 14 * 60), end: halifaxToDate("2026-10-24", 15 * 60 + 15) }];
  const times = slotsForDay({ date: "2026-10-24", now: yesterday, busy, cars: 2 }).slots.map((s) => s.time);
  assert.ok(!times.includes("12:00"));  // 12:00 to 2:30 would hit the 2:00 job
  assert.ok(times.includes("11:30"));   // 11:30 to 2:00 fits exactly
});

test("past days and more than 30 days ahead are closed", () => {
  assert.equal(slotsForDay({ date: "2026-10-22", now: yesterday, busy: [] }).open, false);
  assert.equal(slotsForDay({ date: "2026-12-01", now: yesterday, busy: [] }).open, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsForDay, halifaxToDate, halifaxDate, driveMin } from "../slots.ts";

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

test("a 12:00 oil change blocks its 45 min on site, and nobody can overlap it", () => {
  const busy = [{ start: halifaxToDate("2026-10-24", 720), end: halifaxToDate("2026-10-24", 765) }];
  const times = slotsForDay({ date: "2026-10-24", now: yesterday, busy }).slots.map((s) => s.time);
  for (const gone of ["11:30", "12:00", "12:30"]) assert.ok(!times.includes(gone), gone);
  assert.ok(times.includes("11:00"));   // 11:00 to 11:45, done before 12:00 (no drive: no places given)
  assert.ok(times.includes("13:00"));   // free from 12:45
});

const HALIFAX = { lat: 44.67, lng: -63.6 };
const near = { lat: HALIFAX.lat + 0.046, lng: HALIFAX.lng };   // about 5 km away
const far = { lat: HALIFAX.lat + 0.27, lng: HALIFAX.lng };     // about 30 km away

test("the drive to the next visit is counted: a close one fits back to back, a far one leaves a gap", () => {
  // the visit is at HALIFAX (its 12:00 job); the new job is near it or far from it
  const busy = [{ start: halifaxToDate("2026-10-24", 720), end: halifaxToDate("2026-10-24", 765), pt: HALIFAX }];
  const at = (pt: typeof near) => slotsForDay({ date: "2026-10-24", now: yesterday, busy, at: pt }).slots.map((s) => s.time);
  assert.ok(driveMin(near, HALIFAX) <= 15 && driveMin(far, HALIFAX) >= 45);
  assert.ok(at(near).includes("13:00"));    // 12:45 + a 10 min drive: 1:00 is fine
  assert.ok(!at(far).includes("13:00"));    // 12:45 + about an hour of driving: not yet
  assert.ok(!at(far).includes("13:30"));
  assert.ok(at(near).includes("11:00"));    // done 11:45, 10 min drive, before 12:00
  assert.ok(!at(far).includes("11:00"));
});

test("two cars take 2 x 45 min", () => {
  const busy = [{ start: halifaxToDate("2026-10-24", 14 * 60), end: halifaxToDate("2026-10-24", 15 * 60 + 15) }];
  const times = slotsForDay({ date: "2026-10-24", now: yesterday, busy, cars: 2 }).slots.map((s) => s.time);
  assert.ok(times.includes("12:30"));   // 12:30 to 2:00 fits exactly
  assert.ok(!times.includes("13:00"));  // 1:00 to 2:30 hits the 2:00 visit
});

test("same day needs 1 hour notice", () => {
  const r = slotsForDay({ date: "2026-10-24", now: at("2026-10-24T10:05:00-03:00"), busy: [] });
  assert.equal(r.slots[0].label, "11:30 am");
});

test("a gap after a 10:00 job is bookable at 11:30 when it's 9:45 (Nov 2)", () => {
  const ten = { start: at("2026-11-02T10:00:00-04:00"), end: at("2026-11-02T11:15:00-04:00") };
  const r = slotsForDay({ date: "2026-11-02", now: at("2026-11-02T09:45:00-04:00"), busy: [ten] });
  const times = r.slots.map((s) => s.time);
  assert.ok(times.includes("11:30") && !times.includes("10:30") && !times.includes("11:00"));
});

test("public holiday: no same-day booking unless the filter is in stock", () => {
  const now = at("2026-11-11T08:00:00-04:00");
  const holidays = ["2026-11-11"];
  assert.equal(slotsForDay({ date: "2026-11-11", now, busy: [], partsClosedDates: holidays }).open, false);
  assert.equal(slotsForDay({ date: "2026-11-11", now, busy: [], partsClosedDates: holidays, needsPartsRun: false }).open, true);
  assert.equal(slotsForDay({ date: "2026-11-11", now: yesterday, busy: [], partsClosedDates: holidays }).open, true); // booked ahead is fine
});

test("past days and more than 30 days ahead are closed", () => {
  assert.equal(slotsForDay({ date: "2026-10-22", now: yesterday, busy: [] }).open, false);
  assert.equal(slotsForDay({ date: "2026-12-01", now: yesterday, busy: [] }).open, false);
});

import { seasonFor } from "../seasons.ts";
test("seasonal package windows: Oct 1 to Dec 15 and Mar 15 to May 31", () => {
  assert.equal(seasonFor("2026-10-24")?.name, "Winter tires");
  assert.equal(seasonFor("2026-12-15")?.name, "Winter tires");
  assert.equal(seasonFor("2026-12-16"), null);
  assert.equal(seasonFor("2027-03-15")?.name, "Summer tires");
  assert.equal(seasonFor("2027-07-01"), null);
  assert.equal(seasonFor("2027-01-05", [{ name: "x", from: "11-15", to: "01-15" }])?.name, "x");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCustomers, dueState, matches } from "../customer-summary.ts";

const day = (ts: string) => ts.slice(0, 10);
const cust = (id: string, first: string, extra = {}) => ({ id, first_name: first, last_name: "Smith", phone: null, email: null, address: null, sms_opt_out: false,
  created_at: "2026-05-01T12:00:00Z", source: null, vehicles: [{ year: 2016, make: "Honda", model: "Civic" }], ...extra });

test("due: overdue, within 2 weeks, booked wins, unknown", () => {
  assert.equal(dueState("2026-10-20", null, "2026-10-24"), "overdue");
  assert.equal(dueState("2026-11-05", null, "2026-10-24"), "soon");
  assert.equal(dueState("2026-12-20", null, "2026-10-24"), "ok");
  assert.equal(dueState("2026-10-20", "2026-10-30", "2026-10-24"), "booked");
  assert.equal(dueState(null, null, "2026-10-24"), "none");
});

test("visits, spend, last visit and next due come from their jobs; next booking ignores past and cancelled", () => {
  const [r, empty] = summarizeCustomers([cust("a", "Rod"), cust("b", "Amy")], [
    { customer_id: "a", done_at: "2026-06-10T15:00:00Z", revenue: 90, next_due_date: "2026-12-10" },
    { customer_id: "a", done_at: "2026-10-03T15:00:00Z", revenue: 114.6, next_due_date: "2027-04-03" },
  ], [
    { customer_id: "a", starts_at: "2026-10-20T15:00:00Z", status: "confirmed" },
    { customer_id: "a", starts_at: "2026-11-02T15:00:00Z", status: "cancelled" },
  ], "2026-10-24", day);
  assert.equal(r.visits, 2); assert.equal(r.spent, 204.6); assert.equal(r.lastVisit, "2026-10-03");
  assert.equal(r.nextDue, "2027-04-03"); assert.equal(r.nextBooking, null); assert.equal(r.due, "ok");
  assert.deepEqual(r.cars, ["2016 Honda Civic"]);
  assert.equal(empty.visits, 0); assert.equal(empty.due, "none");
});

test("search: any order of words, phone digits, cars", () => {
  const c = { name: "Rod Smith", phone: "+19025551234", email: "rod@x.ca", cars: ["2016 Honda Civic"], address: "20 Lighthouse Lane" };
  assert.ok(matches(c, "smith civic"));
  assert.ok(matches(c, "555-1234"));
  assert.ok(matches(c, "lighthouse"));
  assert.ok(!matches(c, "corolla"));
  assert.ok(matches(c, ""));
});

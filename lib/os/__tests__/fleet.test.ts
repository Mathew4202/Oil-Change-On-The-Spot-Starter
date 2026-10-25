import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceLines, invoiceTotals, dueState } from "../fleet-math.ts";

test("invoice: one line per visit, oldest first, HST on the total", () => {
  const lines = invoiceLines([
    { done_at: "2026-11-12T15:00:00Z", km: 120500, lines: [{ label: "Oil change, fleet price", amount: 125 }], subtotal: 125, vehicle_text: "2019 Chevrolet Express", receipt_no: 2002, unit: "12", plate: null, vin: null },
    { done_at: "2026-11-03T15:00:00Z", km: 88000, lines: [{ label: "Oil change, fleet price", amount: 115 }], subtotal: 115, vehicle_text: "2020 GMC Savana", receipt_no: 2001, unit: "7", plate: "HDP 938", vin: null },
  ]);
  assert.deepEqual(lines.map((l) => l.unit), ["7", "12"]);
  assert.deepEqual(invoiceTotals(lines, 0.14), { subtotal: 240, hst: 33.6, total: 273.6 });
});

test("due dates", () => {
  assert.deepEqual(dueState(null, 4, "2026-11-01", false), { state: "new", date: null });
  assert.equal(dueState("2026-06-01", 4, "2026-11-01", false).state, "due");
  assert.equal(dueState("2026-07-15", 4, "2026-11-01", false).state, "soon");   // due Nov 15
  assert.equal(dueState("2026-09-01", 4, "2026-11-01", false).state, "ok");     // due Jan 1
  assert.equal(dueState("2026-06-01", 4, "2026-11-01", true).state, "booked");
});

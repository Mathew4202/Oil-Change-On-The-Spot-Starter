import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, canOf, cleanUsername } from "../roles.ts";

test("front desk: calendar, customers, calls, booking; no money, stock, jobs or team", () => {
  const r = "front_desk";
  assert.deepEqual(canOf(r).tabs, ["calendar", "customers"]);
  for (const p of ["/owner", "/owner/customers", "/owner/customers/abc", "/owner/fleets/x", "/api/owner/calls", "/api/owner/book", "/api/owner/hold", "/api/owner/manage", "/api/owner/day", "/api/owner/customers", "/api/owner/fleet"])
    assert.equal(allowed(r, p), true, p);
  for (const p of ["/owner/money", "/owner/stock", "/owner/receipt", "/owner/team", "/api/owner/money", "/api/owner/bank", "/api/owner/job", "/api/owner/stock", "/api/owner/receipt", "/api/owner/team", "/api/owner/specs", "/api/owner/time-off", "/api/owner/something-new"])
    assert.equal(allowed(r, p), false, p);
});

test("technician: jobs, stock and receipts; no booking, customers or money", () => {
  const r = "technician";
  for (const p of ["/owner", "/owner/stock", "/owner/receipt", "/api/owner/job", "/api/owner/stock", "/api/owner/receipt", "/api/owner/read-photo", "/api/owner/day"]) assert.equal(allowed(r, p), true, p);
  for (const p of ["/owner/customers", "/owner/money", "/owner/fleets", "/api/owner/book", "/api/owner/calls", "/api/owner/money", "/api/owner/fleet"]) assert.equal(allowed(r, p), false, p);
});

test("owners get everything, managers never see money or the team", () => {
  for (const p of ["/owner/money", "/owner/team", "/api/owner/bank", "/api/owner/anything"]) assert.equal(allowed("owner", p), true);
  assert.equal(allowed("manager", "/owner/money"), false);
  assert.equal(allowed("manager", "/owner/team"), false);
  assert.equal(allowed("manager", "/api/owner/job"), true);
  assert.equal(canOf("manager").invoices, false);
  assert.equal(canOf("nonsense").money, false);   // an unknown role gets the least
});

test("login names", () => {
  assert.equal(cleanUsername(" Teagan "), "teagan");
  assert.equal(cleanUsername("Mary Jo.Smith"), "maryjosmith");
});

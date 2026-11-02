import { test } from "node:test";
import assert from "node:assert/strict";
import { lastVisit, lastVisitText, beforeSignoff } from "../last-visit.ts";

test("what we flagged last time becomes one line above the sign-off", () => {
  const v = lastVisit({ tires: { status: "soon" }, wipers: { status: "now" }, coolant: { status: "ok" } }, "Front tires are getting bald.");
  assert.deepEqual(v, { now: ["Wiper blades"], soon: ["Tires"], note: "Front tires are getting bald." });
  const line = lastVisitText(v);
  assert.equal(line, "Last visit we noted: Front tires are getting bald. Also wiper blades (needs doing), tires (coming up soon). We can take care of it at the same visit, just reply and we'll add it.");
  assert.equal(beforeSignoff("Hi Sam, see you tomorrow.\nNeed to change it? link\n- Mathew, Oil Change On The Spot", "X"), "Hi Sam, see you tomorrow.\nNeed to change it? link\nX\n- Mathew, Oil Change On The Spot");
  assert.equal(lastVisitText(lastVisit({ coolant: { status: "ok" } }, "")), "");
});

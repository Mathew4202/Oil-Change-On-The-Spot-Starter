import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInterac, nameMatches } from "../etransfer-parse.ts";

test("reads an Interac auto-deposit email", () => {
  const r = parseInterac("INTERAC e-Transfer: Kierstan Hinkley sent you money.",
    "Hi OIL CHANGE ON THE SPOT LIMITED,\nKierstan Hinkley has sent you $124.00 (CAD) and the money has been automatically deposited into your bank account.\nMessage: #1025 thanks!\nReference Number: CAabc123");
  assert.equal(r.amount, 124); assert.equal(r.sender, "Kierstan Hinkley"); assert.deepEqual(r.refs, [1025]); assert.equal(r.deposited, true);
});

test("receipt number written different ways, or none", () => {
  assert.deepEqual(parseInterac("INTERAC e-Transfer: Sam Lee sent you money.", "Amount: $102.60 (CAD)\nMessage: receipt 1031").refs, [1031]);
  assert.deepEqual(parseInterac("INTERAC e-Transfer: Sam Lee sent you money.", "Amount: $102.60 (CAD)\nMessage: oil change").refs, []);
  assert.equal(parseInterac("x", "Amount: $1,234.50 (CAD)").amount, 1234.5);
});

test("names", () => {
  assert.equal(nameMatches("KIERSTAN HINKLEY", "Kierstan", "Hinkley"), true);
  assert.equal(nameMatches("Kierstan Smith", "Kierstan", "Hinkley"), false);
  assert.equal(nameMatches("Sam Lee", null, null), false);
});

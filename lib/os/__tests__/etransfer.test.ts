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

test("Interac's newer wording, and our own transfers out are skipped", () => {
  const r = parseInterac("Interac e-Transfer: You've received $102.60 from Sam Example and it has been automatically deposited.",
    "Hi OIL CHANGE ON THE SPOT LIMITED,\n\nFunds Deposited!\n$102.60\n\nYour funds have been automatically deposited into your account at BMO Bank of Montreal.\n\nTransfer Details\n\nDate: Nov 2, 2026\nReference Number: C1AP3gTUJK6t\nSent From: Sam Example\nAmount: $102.60 (CAD)\n");
  assert.equal(r.amount, 102.6); assert.equal(r.sender, "Sam Example"); assert.equal(r.incoming, true); assert.deepEqual(r.refs, []);
  const co = parseInterac("Interac e-Transfer: You've received $125.40 from 1234567 NOVA SCOTIA LIMITED and it has been automatically deposited.", "Sent From: 1234567 NOVA SCOTIA LIMITED\nAmount: $125.40 (CAD)\nMessage: #1009");
  assert.equal(co.sender, "1234567 NOVA SCOTIA LIMITED"); assert.deepEqual(co.refs, [1009]);
  const out = parseInterac("Interac e-Transfer: Your $474.00 transfer to OIL CHANGE ON THE SPOT LIMITED has been successfully deposited.", "Your transfer has been deposited.");
  assert.equal(out.incoming, false);
});

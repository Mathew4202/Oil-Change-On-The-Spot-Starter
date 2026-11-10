import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptText, receiptHtml } from "../receipt.ts";

test("family price receipt: regular price, then the family discount, no refer-a-friend", () => {
  const r = { receiptNo: 1023, date: "Nov 10, 2026", customer: "Eesha", car: "2013 Acura RDX", lines: [{ label: "Oil at our cost", amount: 35.41 }],
    subtotal: 35.41, hst: 4.96, total: 40.37, referUrl: "https://x/r/abc", family: { lines: [{ label: "Full synthetic oil change", amount: 90 }], subtotal: 90 } };
  const t = receiptText(r);
  assert.match(t, /Full synthetic oil change: \$90\.00\nSubtotal: \$90\.00\nFamily discount: −\$54\.59\nHST 14%: \$4\.96\nTotal: \$40\.37/);
  assert.doesNotMatch(t, /Refer a friend/);
  assert.doesNotMatch(receiptHtml(r), /Refer a friend/);
});

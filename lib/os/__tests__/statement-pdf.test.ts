import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatement, type Row } from "../statement-pdf.ts";

const row = (y: number, cells: [number, string][]): Row => ({ page: 1, y, items: cells.map(([x, str]) => ({ x, str })) });

test("chequing: withdrawals, deposits and the balance column", () => {
  const rows = [
    row(700, [[40, "Date"], [90, "Description"], [330, "Amounts deducted ($)"], [430, "Amounts added ($)"], [520, "Balance ($)"]]),
    row(685, [[40, "Oct 01"], [90, "Opening balance"], [550, "1,200.00"]]),
    row(670, [[40, "Oct 03"], [90, "Debit Card Purchase, NAPA"], [370, "45.67"], [550, "1,154.33"]]),
    row(655, [[40, "Oct 05"], [90, "INTERAC e-Transfer From: JOHN"], [470, "110.00"], [550, "1,264.33"]]),
  ];
  const r = parseStatement(rows, "BMO Everyday Banking period ending October 31, 2026");
  assert.deepEqual(r.lines.map((l) => [l.date, l.amount]), [["2026-10-03", -45.67], ["2026-10-05", 110]]);
});

test("credit card: two dates, CR is a payment, December on a January statement is last year", () => {
  const rows = [
    row(700, [[40, "Trans date"], [100, "Post date"], [160, "Description"], [500, "Amount ($)"]]),
    row(685, [[40, "Dec 28"], [100, "Dec 29"], [160, "COSTCO WHOLESALE"], [540, "212.45"]]),
    row(670, [[40, "Jan 02"], [100, "Jan 03"], [160, "PAYMENT THANK YOU"], [540, "500.00 CR"]]),
  ];
  const r = parseStatement(rows, "CIBC Mastercard Statement period Dec 24, 2026 to Jan 23, 2027 credit limit");
  assert.equal(r.isCreditCard, true);
  assert.deepEqual(r.lines, [
    { date: "2026-12-28", amount: -212.45, description: "COSTCO WHOLESALE" },
    { date: "2027-01-02", amount: 500, description: "PAYMENT THANK YOU" },
  ]);
});

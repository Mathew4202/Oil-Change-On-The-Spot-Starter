import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBankCsv, lineKeys, sortLine, subsetSum, matchStatement, toIsoDate, cleanStatement } from "../bank.ts";
import { periodFor, summarize, groupOf, byMonth } from "../money.ts";

const CHEQUING = `Following data is valid as of 20261101093000 (Year/Month/Day/Hour/Minute/Second)


First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description


'5191230012344321',DEBIT,20261003,-34.98,[DN]NAPA AUTO PARTS DARTMOUTH
'5191230012344321',DEBIT,20261006,-61.20,[DN]IRVING OIL 1234 DARTMOUTH
'5191230012344321',CREDIT,20261007,113.99,[CW]INTERAC E-TRANSFER RECEIVED
'5191230012344321',CREDIT,20261008,452.10,[DS]SQUARE CANADA DEPOSIT
'5191230012344321',DEBIT,20261015,-6.95,[SC]PLAN FEE
'5191230012344321',DEBIT,20261020,-400.00,[CW]MASTERCARD PAYMENT BMO MC
'5191230012344321',DEBIT,20261030,-125.40,[CW]BILL PAYMENT NAPA AUTO PARTS
'5191230012344321',DEBIT,20261031,-20.00,[CW]INTERAC E-TRANSFER SENT`;

const CARD = `Item #,Card #,Transaction Date,Posting Date,Transaction Amount,Description
1,'5191XXXXXXXX9876',20261002,20261003,22.60,"VERCEL INC., COVINA"
2,'5191XXXXXXXX9876',20261010,20261011,-400.00,PAYMENT RECEIVED - THANK YOU
3,'5191XXXXXXXX9876',20261012,20261013,8.05,SQ *TIM HORTONS`;

test("dates in the formats banks use", () => {
  assert.equal(toIsoDate("20261003"), "2026-10-03");
  assert.equal(toIsoDate("10/03/2026"), "2026-10-03");
  assert.equal(toIsoDate("2026-10-3"), "2026-10-03");
  assert.equal(toIsoDate("Oct 3, 2026"), "2026-10-03");
});

test("BMO chequing CSV: money out is negative, account named with last 4", () => {
  const p = parseBankCsv(CHEQUING);
  assert.equal(p.account, "BMO chequing 4321");
  assert.equal(p.lines.length, 8);
  assert.deepEqual(p.lines[0], { date: "2026-10-03", amount: -34.98, description: "[DN]NAPA AUTO PARTS DARTMOUTH" });
  assert.equal(p.lines[2].amount, 113.99);
});

test("BMO Mastercard CSV: purchases flip to money out, payments to the card are money in", () => {
  const p = parseBankCsv(CARD);
  assert.equal(p.account, "BMO Mastercard 9876");
  assert.equal(p.lines[0].amount, -22.6);
  assert.equal(p.lines[0].date, "2026-10-03");
  assert.equal(p.lines[1].amount, 400);
});

test("Debit / Credit column CSVs work too", () => {
  const p = parseBankCsv(`Date,Description,Debit,Credit\n2026-10-01,COSTCO GAS,55.10,\n2026-10-02,DEPOSIT,,200.00`);
  assert.deepEqual(p.lines.map((l) => l.amount), [-55.1, 200]);
});

test("a file that isn't a statement says so", () => {
  assert.ok(parseBankCsv("hello,world\n1,2").error);
});

test("repeated identical lines get different keys, so a re-upload doesn't double them", () => {
  const l = { date: "2026-10-01", amount: -5, description: "TIM" };
  const k = lineKeys("BMO chequing 1", [l, l]);
  assert.notEqual(k[0], k[1]);
  assert.deepEqual(lineKeys("BMO chequing 1", [l, l]), k);
});

test("sorting lines", () => {
  const s = (description: string, amount = -10) => sortLine({ date: "2026-10-01", amount, description }).kind + ":" + sortLine({ date: "2026-10-01", amount, description }).category;
  assert.equal(s("[CW]MASTERCARD PAYMENT BMO MC"), "transfer:transfer");
  assert.equal(s("INTERAC E-TRANSFER SENT"), "receipt:null");
  assert.equal(s("INTERAC E-TRANSFER RECEIVED", 50), "payment:null");
  assert.equal(s("[SC]PLAN FEE"), "bank_fee:bank_fees");
  assert.equal(s("SQUARE CANADA DEPOSIT", 400), "card_payout:sales");
  assert.equal(s("SQ *TIM HORTONS"), "receipt:null");
  assert.equal(s("IRVING OIL 1234"), "receipt:fuel");
  assert.equal(s("NAPA AUTO PARTS", 20), "money_in:refund");
  assert.equal(s("INTEREST PAID", 0.12), "money_in:interest");
});

test("subset sum finds the NAPA receipts a payment covers", () => {
  const items = [{ id: "a", cents: 3498 }, { id: "b", cents: 5012 }, { id: "c", cents: 9042 }, { id: "d", cents: 1200 }];
  assert.deepEqual(subsetSum(items, 3498 + 9042)?.sort(), ["a", "c"]);
  assert.deepEqual(subsetSum(items, 3498 + 5012 + 9042 + 1200)?.sort(), ["a", "b", "c", "d"]);
  assert.equal(subsetSum(items, 1), null);
});

test("matching a month: receipts, NAPA account, e-transfer, fees, payouts, and what's left to look at", () => {
  const { lines } = parseBankCsv(CHEQUING);
  const exp = [
    { id: "irving", date: "2026-10-05", total: 61.2, supplier: "other", vendor: "Irving Oil", paid_with: "card" },
    { id: "napa1", date: "2026-10-03", total: 34.98, supplier: "napa", vendor: "NAPA Auto Parts", paid_with: "on_account" },
    { id: "napa2", date: "2026-10-12", total: 90.42, supplier: "napa", vendor: "NAPA Auto Parts", paid_with: "on_account" },
    { id: "napa3", date: "2026-10-29", total: 50.00, supplier: "napa", vendor: "NAPA Auto Parts", paid_with: "on_account" },
  ];
  const pay = [{ id: "p1", date: "2026-10-06", amount: 113.99, method: "etransfer" }];
  const r = matchStatement(lines, exp, pay);
  const by = (d: string) => r.find((x) => x.description.includes(d))!;
  // The NAPA line on Oct 3 is the same amount as an on-account receipt, but on-account receipts are never paid at the till
  assert.equal(by("NAPA AUTO PARTS DARTMOUTH").status, "needs_look");
  assert.deepEqual(by("IRVING").expenseIds, ["irving"]);
  assert.equal(by("E-TRANSFER RECEIVED").paymentId, "p1");
  assert.equal(by("SQUARE").status, "auto");
  assert.equal(by("PLAN FEE").kind, "bank_fee");
  assert.equal(by("MASTERCARD").kind, "transfer");
  const napa = by("BILL PAYMENT NAPA");
  assert.equal(napa.kind, "napa_account");
  assert.deepEqual(napa.expenseIds.sort(), ["napa1", "napa2"]);
  assert.equal(by("E-TRANSFER SENT").status, "needs_look");
});

test("a receipt is only matched once", () => {
  const l = [{ date: "2026-10-05", amount: -20, description: "SHELL" }, { date: "2026-10-06", amount: -20, description: "SHELL" }];
  const r = matchStatement(l, [{ id: "x", date: "2026-10-05", total: 20, supplier: null, vendor: "Shell", paid_with: "card" }], []);
  assert.deepEqual(r.map((x) => x.status), ["matched", "needs_look"]);
});

test("periods: week starts Monday, month and year bounds", () => {
  assert.deepEqual(periodFor("week", 0, "2026-10-24"), { kind: "week", offset: 0, from: "2026-10-19", to: "2026-10-25", label: "This week" });
  assert.equal(periodFor("week", -1, "2026-10-24").from, "2026-10-12");
  const m = periodFor("month", -10, "2026-10-24");
  assert.deepEqual([m.from, m.to, m.label], ["2025-12-01", "2025-12-31", "December 2025"]);
  assert.deepEqual([periodFor("month", 0, "2026-02-10").to], ["2026-02-28"]);
  assert.equal(periodFor("year", -1, "2026-10-24").label, "2025");
});

test("profit, HST owing and spending groups", () => {
  const jobs = [
    { done_at: "2026-10-05T15:00:00Z", revenue: 100, hst: 14, cost_oil: 20, cost_parts: 6, cost_other: 1, done_by: "mathew" },
    { done_at: "2026-10-06T15:00:00Z", revenue: 60, hst: null, cost_oil: 18, cost_parts: 5, cost_other: 1, done_by: null },
  ];
  const exp = [
    { spent_at: "2026-10-03", total: 34.98, hst: 4.3, subtotal: 30.68, category: "oil_filter" },
    { spent_at: "2026-10-06", total: 61.2, hst: 7.52, subtotal: null, category: "fuel" },
    { spent_at: "2026-10-15", total: 6.95, hst: 0, subtotal: null, category: "bank_fees" },
  ];
  const s = summarize(jobs, exp);
  assert.equal(s.sales, 160);
  assert.equal(s.spending, 91.31);
  assert.equal(s.profit, 68.69);
  assert.equal(s.hstOwing, 2.18);
  assert.equal(s.jobProfit, 160 - 51);
  assert.deepEqual(s.doneBy, { mathew: 1, harsh: 0, both: 1 });
  assert.equal(s.spendingByGroup[0].name, "Gas");
  assert.equal(groupOf("cabin_filter"), "parts");
  assert.equal(groupOf("tool"), "supplies");
  assert.equal(groupOf(null), "other");
  const months = byMonth(2026, jobs, exp, (ts) => ts.slice(0, 10));
  assert.equal(months[9].sales, 160);
  assert.equal(months[0].sales, 0);
});

test("a bank fee already logged by hand isn't added twice", () => {
  const r = matchStatement([{ date: "2026-09-30", amount: -5.25, description: "[SC]PLAN FEE" }], [{ id: "bmo", date: "2026-09-29", total: 5.25, supplier: null, vendor: null, paid_with: null }], []);
  assert.equal(r[0].status, "matched");
  assert.deepEqual(r[0].expenseIds, ["bmo"]);
});

test("old 'other' expenses get grouped by their description", () => {
  assert.equal(groupOf("other", "Google ad"), "marketing");
  assert.equal(groupOf("other", "Golf course ad"), "marketing");
  assert.equal(groupOf("other", "Square payment fees"), "fees");
  assert.equal(groupOf("other", "Parking ticket"), "other");
  assert.equal(groupOf("gas", "anything"), "fuel");
});

test("PDF statement read by the AI is tidied: bad rows dropped, long card numbers cut to last 4", () => {
  const p = cleanStatement({ account: "BMO Mastercard 5191230012349876", lines: [
    { date: "Oct 3, 2026", amount: -22.6, description: "VERCEL  INC" }, { date: "nope", amount: 5, description: "x" }, { date: "2026-10-04", amount: 0, description: "zero" }] });
  assert.equal(p.account, "BMO Mastercard 9876");
  assert.deepEqual(p.lines, [{ date: "2026-10-03", amount: -22.6, description: "VERCEL INC" }]);
  assert.ok(cleanStatement({ lines: [] }).error);
});

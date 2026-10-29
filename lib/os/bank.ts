// Bank statements: read the CSV, sort each line, and match it to receipts and payments.
// Pure functions only (tested in __tests__/bank.test.ts).

export type BankLine = { date: string; amount: number; description: string };   // amount < 0 = money out
export type Parsed = { account: string; lines: BankLine[]; error?: string };
export type Exp = { id: string; date: string; total: number; supplier: string | null; vendor: string | null; paid_with: string | null };
export type Pay = { id: string; date: string; amount: number; method: string | null };
export type Owed = { bookingId: string; date: string; due: number; receiptNo: number | null; name: string };   // a finished job not paid yet
export type Result = BankLine & {
  status: "matched" | "auto" | "needs_look";
  owedBookingId?: string | null;   // an e-transfer that pays a bill we sent: mark that job paid
  kind: string;
  category: string | null;
  expenseIds: string[];
  paymentId: string | null;
  note: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(Math.abs(n) * 100);

// ---------- CSV ----------
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^'+|'+$/g, ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function toIsoDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})(\d{2})(\d{2})$/) || t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);                         // MM/DD/YYYY (BMO / North American)
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);            // Oct 1, 2026
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
const num = (s: string | undefined) => {
  if (s == null) return NaN;
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || /-$/.test(t);
  const n = parseFloat(t.replace(/[()]/g, "").replace(/-$/, ""));
  return neg ? -Math.abs(n) : n;
};

/** Reads BMO chequing and Mastercard CSV exports, plus most other bank CSVs. */
export function parseBankCsv(text: string, fileName = ""): Parsed {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine);
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|withdraw|credit|deposit/i.test(c)));
  if (hi < 0) return { account: "", lines: [], error: "Couldn't find the column headings (Date, Amount, Description) in that file." };
  const h = rows[hi].map((c) => c.toLowerCase());
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const dateCol = col(/date posted|posting date|posted/) >= 0 ? col(/date posted|posting date|posted/) : col(/date/);
  const amtCol = col(/amount/);
  const debitCol = col(/debit|withdraw|paid out|money out/), creditCol = col(/credit|deposit|paid in|money in/);
  const descCol = col(/description|details|payee|memo|merchant|transaction$/) >= 0 ? col(/description|details|payee|memo|merchant|transaction$/) : col(/type/);
  const cardCol = col(/card ?#|card number|first bank card|account/);
  const isCreditCard = h.some((c) => /card ?#/.test(c)) || /mastercard|credit|visa/i.test(fileName);

  const lines: BankLine[] = [];
  let cardNo = "";
  for (const r of rows.slice(hi + 1)) {
    const date = toIsoDate(r[dateCol] ?? "");
    if (!date) continue;
    let amount: number;
    if (amtCol >= 0 && Number.isFinite(num(r[amtCol]))) {
      amount = num(r[amtCol]);
      if (isCreditCard) amount = -amount;                                   // on a card, a purchase shows as +, it's money out for us
    } else {
      const d = num(r[debitCol]), c = num(r[creditCol]);
      amount = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    const description = (descCol >= 0 ? r[descCol] : r.filter((_, i) => i !== dateCol && i !== amtCol).join(" ")).replace(/\s+/g, " ").trim();
    if (!cardNo && cardCol >= 0) cardNo = (r[cardCol] || "").replace(/\D/g, "").slice(-4);
    lines.push({ date, amount: r2(amount), description });
  }
  if (!lines.length) return { account: "", lines: [], error: "That file had no transactions in it." };
  const account = `BMO ${isCreditCard ? "Mastercard" : "chequing"}${cardNo ? ` ${cardNo}` : ""}`;
  return { account, lines };
}

/** Tidy what the AI read off a PDF statement. */
export function cleanStatement(raw: unknown): Parsed {
  const o = (raw ?? {}) as { account?: unknown; lines?: unknown };
  const lines = (Array.isArray(o.lines) ? o.lines : []).map((l: { date?: unknown; amount?: unknown; description?: unknown }) => ({
    date: toIsoDate(String(l?.date ?? "")) ?? "",
    amount: Math.round(Number(l?.amount) * 100) / 100,
    description: String(l?.description ?? "").replace(/\s+/g, " ").trim(),
  })).filter((l) => l.date && Number.isFinite(l.amount) && l.amount !== 0);
  const account = String(o.account ?? "").replace(/\d{5,}/g, (d) => d.slice(-4)).slice(0, 60) || "BMO";
  return lines.length ? { account, lines } : { account, lines: [], error: "Couldn't find any transactions in that PDF." };
}

/** Same line can appear on two statements that overlap. Key = account + date + amount + description + how many times it repeats. */
export function lineKeys(account: string, lines: BankLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${account}|${l.date}|${l.amount.toFixed(2)}|${l.description.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return `${base}|${n}`;
  });
}

// ---------- sorting each line ----------
const RULES: [RegExp, string, string][] = [
  // [pattern, kind, category]
  [/payment (received|thank)|thank you.*payment|mastercard|bmo mc|\bmc pymt|credit card pay|(?<!e-)(?<!e)transfer (to|from)|\btfr\b|\btf \d|internet transfer|online transfer|between accounts/i, "transfer", "transfer"],
  [/\bfee\b|fees\b|service charge|plan charge|interest|overdraft|\bnsf\b/i, "bank_fee", "bank_fees"],
  [/sq \*|sqc \*/i, "receipt", ""],                                         // a shop that takes cards through Square
  [/square|elavon|converge|stripe|moneris|helcim|clover/i, "card_payout", "sales"],
  [/napa|partsource|part source|canadian tire|princess auto|east coast lub|lordco|uap|westpier|carquest|lube/i, "receipt", "parts"],
  [/irving|esso|petro|shell|ultramar|circle k|co-?op gas|costco gas|pioneer|wilson|gas bar|fuel|needs convenience/i, "receipt", "fuel"],
  [/vercel|supabase|anthropic|claude\.ai|google|gsuite|workspace|quo\b|openphone|wix|godaddy|resend|apple\.com|adobe|canva|capcut|microsoft|openai|github/i, "receipt", "software"],
  [/insur|intact|aviva|wawanesa|economical|td ins|belair|desjardins gen/i, "receipt", "insurance"],
  [/\bbell\b|rogers|telus|eastlink|fido|koodo|virgin|freedom mob|chatr|public mobile/i, "receipt", "phone"],
  [/home depot|kent|rona|walmart|costco|dollarama|amazon|amzn/i, "receipt", "supplies"],
];
export function sortLine(l: BankLine): { kind: string; category: string | null } {
  for (const [re, kind, category] of RULES) {
    if (!re.test(l.description)) continue;
    if (kind === "card_payout" && l.amount < 0) return { kind: "receipt", category: "fees" };   // Square/processor charging us
    if (kind === "bank_fee" && l.amount > 0) return { kind: "money_in", category: "interest" };
    if (kind === "receipt" && l.amount > 0) return { kind: "money_in", category: "refund" };    // a store refund
    return { kind, category: category || null };
  }
  if (l.amount > 0) return { kind: /e-?transfer|interac|autodeposit|etfr/i.test(l.description) ? "payment" : "money_in", category: null };
  return { kind: "receipt", category: null };
}

const days = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

/** Pick items whose totals add up exactly to target (in cents). Oldest first wins ties. */
export function subsetSum(items: { id: string; cents: number }[], target: number): string[] | null {
  if (target <= 0 || items.length === 0) return null;
  const total = items.reduce((t, i) => t + i.cents, 0);
  if (total === target) return items.map((i) => i.id);
  if (total < target || target > 2_000_000 || items.length > 120) return null;
  const by = new Int16Array(target + 1).fill(-1);                           // by[s] = item that first reached sum s
  const reached = new Uint8Array(target + 1); reached[0] = 1;
  for (let i = 0; i < items.length; i++) {
    const w = items[i].cents;
    for (let s = target; s >= w; s--) if (!reached[s] && reached[s - w]) { reached[s] = 1; by[s] = i; }
    if (reached[target]) break;
  }
  if (!reached[target]) return null;
  const ids: string[] = []; let s = target;
  while (s > 0) { const i = by[s]; ids.push(items[i].id); s -= items[i].cents; }
  return ids;
}

/** Sort every line and match it to a receipt, a NAPA account bill, or a customer payment. */
export function matchStatement(lines: BankLine[], expenses: Exp[], payments: Pay[], owed: Owed[] = []): Result[] {
  const usedExp = new Set<string>(), usedPay = new Set<string>(), usedOwed = new Set<string>();
  const out: Result[] = lines.map((l) => ({ ...l, ...sortLine(l), status: "needs_look" as const, expenseIds: [], paymentId: null, note: null }));

  // 1) one receipt, same amount, bank posts 0-7 days after the receipt date (3 days before is fine too)
  for (const r of out) {
    if (r.amount >= 0 || r.kind === "transfer") continue;                    // fees too: the old Expense Tracker logged some by hand
    const want = cents(r.amount);
    const word = r.description.toLowerCase();
    const cands = expenses.filter((e) => !usedExp.has(e.id) && e.paid_with !== "on_account" && e.paid_with !== "cash" &&
      cents(e.total) === want && days(r.date, e.date) >= -3 && days(r.date, e.date) <= 7);
    if (!cands.length) continue;
    const score = (e: Exp) => Math.abs(days(r.date, e.date)) - ((e.supplier && word.includes(e.supplier)) || (e.vendor && word.includes(e.vendor.toLowerCase().split(" ")[0])) ? 10 : 0);
    const best = cands.sort((a, b) => score(a) - score(b))[0];
    usedExp.add(best.id);
    Object.assign(r, { status: "matched", kind: "receipt", expenseIds: [best.id], note: null });
  }

  // 2) NAPA account: one payment that pays off several on-account receipts
  for (const r of out) {
    if (r.status !== "needs_look" || r.amount >= 0 || !/napa/i.test(r.description)) continue;
    const owing = expenses.filter((e) => !usedExp.has(e.id) && e.paid_with === "on_account" && (e.supplier === "napa" || /napa/i.test(e.vendor || "")) && e.date < r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ids = subsetSum(owing.map((e) => ({ id: e.id, cents: cents(e.total) })), cents(r.amount));
    if (!ids) { r.note = `NAPA payment. ${owing.length ? `Couldn't match it to the ${owing.length} NAPA account receipt${owing.length === 1 ? "" : "s"} on file.` : "No NAPA account receipts on file."}`; continue; }
    ids.forEach((id) => usedExp.add(id));
    Object.assign(r, { status: "matched", kind: "napa_account", category: "parts", expenseIds: ids, note: `Pays ${ids.length} NAPA account receipt${ids.length === 1 ? "" : "s"}` });
  }

  // 3) money in: e-transfers from customers
  for (const r of out) {
    if (r.amount <= 0 || r.status !== "needs_look") continue;
    const want = cents(r.amount);
    const p = payments.filter((p) => !usedPay.has(p.id) && p.method === "etransfer" && cents(p.amount) === want && days(r.date, p.date) >= -1 && days(r.date, p.date) <= 5)
      .sort((a, b) => Math.abs(days(r.date, a.date)) - Math.abs(days(r.date, b.date)))[0];
    if (p) { usedPay.add(p.id); Object.assign(r, { status: "matched", kind: "payment", category: "sales", paymentId: p.id }); continue; }
    // 3b) an e-transfer for a bill we sent (job done, not paid yet): same amount, after the job. Their name settles a tie.
    if (r.kind === "payment") {
      const words = r.description.toLowerCase();
      const cands = owed.filter((o) => !usedOwed.has(o.bookingId) && cents(o.due) === want && days(r.date, o.date) >= 0 && days(r.date, o.date) <= 45);
      const named = cands.filter((o) => o.name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && words.includes(w)) || (o.receiptNo != null && words.includes(String(o.receiptNo))));
      const pick = named.length === 1 ? named[0] : cands.length === 1 ? cands[0] : null;
      if (pick) { usedOwed.add(pick.bookingId); Object.assign(r, { status: "matched", kind: "payment", category: "sales", owedBookingId: pick.bookingId, note: `Pays ${pick.name}'s bill${pick.receiptNo ? ` (receipt #${pick.receiptNo})` : ""}. Marked paid.` }); }
      else r.note = cands.length > 1 ? `E-transfer matches ${cands.length} unpaid bills (${cands.map((c) => c.name).join(", ")}). Mark the right one paid in Calendar.` : "Looks like a customer e-transfer, but no job was marked paid by e-transfer for this amount.";
    } else r.note = "Money in that isn't from a job. Sales are counted from your jobs, so this isn't added as income.";
  }

  // 4) lines that don't need a receipt
  for (const r of out) {
    if (r.status !== "needs_look") continue;
    if (r.kind === "transfer") Object.assign(r, { status: "auto", note: "Card payment or transfer between accounts. Not spending." });
    else if (r.kind === "bank_fee") Object.assign(r, { status: "auto", note: "Bank fee. Added to spending, no receipt needed." });
    else if (r.kind === "card_payout") Object.assign(r, { status: "auto", note: "Card sales paid out. Already counted from your jobs." });
  }
  return out;
}

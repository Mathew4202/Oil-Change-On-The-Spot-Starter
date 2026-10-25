// Reads a bank or credit card statement PDF with plain rules, on our own server. No AI, nothing sent anywhere.
// Works from the text positions in the PDF: finds the column headings (withdrawals / deposits / balance, or a single
// amount column on a credit card), then reads each line that starts with a date. Pure, so it's tested on its own.

export type Item = { x: number; str: string };
export type Row = { page: number; y: number; items: Item[] };
type Line = { date: string; amount: number; description: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const AMOUNT = /^\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR|-))?$/i;
const SKIP = /opening balance|closing balance|balance forward|previous (statement )?balance|new balance|^total|subtotal|minimum payment|payment due|credit limit|available credit|interest rate/i;

const num = (s: string) => {
  const neg = /^\(|\)$|^-|-$|CR$/i.test(s.trim());
  const v = Number(s.replace(/[^\d.]/g, ""));
  return { v, credit: neg };
};

/** "Oct 03", "OCT 3", "10/03", "03 Oct", "2026-10-03" at the start of a line → month/day (+ year if given). */
function dateAt(text: string): { m: number; d: number; y: number | null; len: number } | null {
  const t = text.trim();
  let r = t.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  if (r) return { y: +r[1], m: +r[2], d: +r[3], len: r[0].length };
  r = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/);
  if (r && MONTHS.includes(r[1].toLowerCase())) return { m: MONTHS.indexOf(r[1].toLowerCase()) + 1, d: +r[2], y: r[3] ? +r[3] : null, len: r[0].length };
  r = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?\b/);
  if (r && MONTHS.includes(r[2].toLowerCase())) return { m: MONTHS.indexOf(r[2].toLowerCase()) + 1, d: +r[1], y: r[3] ? +r[3] : null, len: r[0].length };
  r = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (r && +r[1] <= 12) return { m: +r[1], d: +r[2], y: r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : null, len: r[0].length };
  return null;
}

export function parseStatement(rows: Row[], fullText: string): { account: string; lines: Line[]; isCreditCard: boolean; error?: string } {
  const text = fullText.replace(/\s+/g, " ");
  const isCreditCard = /mastercard|visa|amex|american express|credit card|credit limit/i.test(text);
  const bank = text.match(/\b(BMO|Bank of Montreal|CIBC|RBC|Royal Bank|TD|Scotiabank|Tangerine|Simplii|Desjardins|National Bank)\b/i)?.[1] ?? "";
  const last4 = text.match(/(?:account|card)(?:\s*(?:no\.?|number|#))?[^\d]{0,20}(?:[\dXx*•]{2,}[\s-]?){1,4}(\d{4})\b/i)?.[1] ?? "";
  const account = [bank.replace(/Bank of Montreal/i, "BMO").replace(/Royal Bank/i, "RBC"), isCreditCard ? "credit card" : "chequing", last4].filter(Boolean).join(" ");

  // statement period → the year for dates printed without one (Dec lines on a Jan statement belong to last year)
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]).filter((y) => y >= 2015 && y <= 2035);
  const endYear = years.length ? Math.max(...years) : new Date().getFullYear();
  const period = text.match(/(?:to|through|-|–)\s*([A-Za-z]{3})[a-z]*\.?\s+\d{1,2},?\s+(20\d{2})/);
  const endMonth = period && MONTHS.includes(period[1].toLowerCase()) ? MONTHS.indexOf(period[1].toLowerCase()) + 1 : 12;
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // column headings (they can change per page)
  type Cols = { out: number[]; inn: number[]; bal: number[]; amt: number[] };
  const colsByPage = new Map<number, Cols>();
  for (const r of rows) {
    const line = r.items.map((i) => i.str).join(" ").toLowerCase();
    if (!/description|transaction|details/.test(line)) continue;
    const c: Cols = { out: [], inn: [], bal: [], amt: [] };
    for (const it of r.items) {
      const s = it.str.toLowerCase();
      if (/deducted|withdrawal|debits?\b|cheques|paid out|money out/.test(s)) c.out.push(it.x);
      else if (/added|deposits?|credits?\b|paid in|money in/.test(s)) c.inn.push(it.x);
      else if (/balance/.test(s)) c.bal.push(it.x);
      else if (/amount/.test(s)) c.amt.push(it.x);
    }
    if (c.out.length || c.inn.length || c.amt.length) colsByPage.set(r.page, c);
  }
  let last: Cols | null = null;
  const lines: Line[] = [];
  let open: Line | null = null;
  for (const r of rows) {
    if (colsByPage.has(r.page)) last = colsByPage.get(r.page)!;
    const items = [...r.items].sort((a, b) => a.x - b.x).filter((i) => i.str.trim());
    const joined = items.map((i) => i.str.trim()).join(" ");
    const d = dateAt(joined);
    const amounts = items.filter((i) => AMOUNT.test(i.str.trim()));
    if (!d) {
      // a description that wraps onto the next line
      if (open && !amounts.length && joined.length < 80 && !SKIP.test(joined)) open.description = `${open.description} ${joined}`.slice(0, 200);
      continue;
    }
    open = null;
    if (SKIP.test(joined) || !amounts.length) continue;
    // credit cards print two dates (transaction, posting): skip the second one
    let rest = joined.slice(d.len).trim();
    const d2 = dateAt(rest);
    if (d2) rest = rest.slice(d2.len).trim();
    const description = rest.split(" ").filter((w) => !AMOUNT.test(w) && !/^(\$|CR|DR)$/i.test(w)).join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
    // which amount is the transaction (not the running balance) and which way it goes
    let pick = amounts[0], sign = -1;
    const near = (x: number, xs: number[]) => xs.length ? Math.min(...xs.map((c) => Math.abs(c - x))) : Infinity;
    if (last && (last.out.length || last.inn.length)) {
      const real = amounts.filter((a) => !(near(a.x, last!.bal) < Math.min(near(a.x, last!.out), near(a.x, last!.inn))));
      if (!real.length) continue;
      pick = real[0];
      sign = near(pick.x, last.inn) < near(pick.x, last.out) ? 1 : -1;
    } else {
      // one amount column (credit cards): purchases are money out, CR / minus is a payment or refund
      pick = amounts.length > 1 && last?.bal.length ? amounts[0] : amounts[amounts.length - 1];
      sign = num(pick.str).credit ? 1 : -1;
      if (!isCreditCard) sign = num(pick.str).credit ? -1 : 1;   // a single-column bank account prints withdrawals with a minus
    }
    const { v } = num(pick.str);
    if (!v) continue;
    const y = d.y ?? (d.m > endMonth ? endYear - 1 : endYear);
    open = { date: iso(y, d.m, d.d), amount: Math.round(sign * v * 100) / 100, description: description || "(no description)" };
    lines.push(open);
  }
  if (!lines.length) return { account, lines, isCreditCard, error: "Couldn't find the transactions in this PDF. Download the CSV from online banking instead, or send us the PDF so we can teach the app its layout." };
  return { account, lines, isCreditCard };
}

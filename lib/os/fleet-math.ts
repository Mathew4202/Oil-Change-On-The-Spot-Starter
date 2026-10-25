// Fleet invoice and due-date maths (no database, so tests can run it).

export type InvoiceLine = { date: string; unit: string | null; vehicle: string; plate: string | null; vin: string | null; km: number | null;
  receiptNo: number | null; items: { label: string; amount: number }[]; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One line per vehicle visit, oldest first. */
export function invoiceLines(jobs: { done_at: string; km: number | null; lines: { label: string; amount: number }[] | null; subtotal: number; vehicle_text: string | null;
  receipt_no: number | null; unit: string | null; plate: string | null; vin: string | null }[]): InvoiceLine[] {
  return [...jobs].sort((a, b) => a.done_at.localeCompare(b.done_at)).map((j) => ({
    date: j.done_at.slice(0, 10), unit: j.unit, vehicle: j.vehicle_text || "", plate: j.plate, vin: j.vin, km: j.km, receiptNo: j.receipt_no,
    items: (j.lines ?? []).map((l) => ({ label: l.label, amount: r2(Number(l.amount)) })), amount: r2(Number(j.subtotal)),
  }));
}

export function invoiceTotals(lines: InvoiceLine[], hstRate: number) {
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  const hst = r2(subtotal * hstRate);
  return { subtotal, hst, total: r2(subtotal + hst) };
}

const addMonths = (iso: string, m: number) => { const [y, mo, d] = iso.slice(0, 10).split("-").map(Number); const x = new Date(Date.UTC(y, mo - 1 + m, d)); return x.toISOString().slice(0, 10); };

/** Due when it's been `every` months since the last service. "soon" = within 3 weeks. Already booked = "booked". */
export function dueState(lastService: string | null, every: number, today: string, booked: boolean): { state: "ok" | "soon" | "due" | "booked" | "new"; date: string | null } {
  if (booked) return { state: "booked", date: lastService ? addMonths(lastService, every) : null };
  if (!lastService) return { state: "new", date: null };
  const date = addMonths(lastService, every);
  if (date <= today) return { state: "due", date };
  const soon = new Date(`${today}T12:00:00Z`); soon.setUTCDate(soon.getUTCDate() + 21);
  return { state: date <= soon.toISOString().slice(0, 10) ? "soon" : "ok", date };
}

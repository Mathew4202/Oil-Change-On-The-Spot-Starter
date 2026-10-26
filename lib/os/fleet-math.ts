// Fleet invoice and due-date maths (no database, so tests can run it).

export type InvoiceLine = { date: string; unit: string | null; vehicle: string; plate: string | null; vin: string | null; km: number | null;
  receiptNo: number | null; items: { label: string; amount: number }[]; amount: number; checks?: Checks | null };

/** What we checked on the car (the OK / Soon / Now taps on the job screen), for the customer. */
export const CHECK_NAMES: Record<string, string> = { coolant: "Coolant", brake_fluid: "Brake fluid", washer_fluid: "Washer fluid", engine_filter: "Engine air filter",
  cabin_filter: "Cabin air filter", wipers: "Wiper blades", tires: "Tires", lights: "Lights" };
export type Checks = { now: string[]; soon: string[]; ok: string[] };
export function checksFrom(inspection: Record<string, { status?: string; note?: string } | string> | null | undefined): Checks | null {
  if (!inspection || typeof inspection !== "object") return null;
  const out: Checks = { now: [], soon: [], ok: [] };
  for (const [k, v] of Object.entries(inspection)) {
    const st = typeof v === "string" ? v : v?.status;
    const name = CHECK_NAMES[k] ?? k.replace(/_/g, " ");
    if (st === "now") out.now.push(name); else if (st === "soon") out.soon.push(name); else if (st === "ok") out.ok.push(name);
  }
  return out.now.length || out.soon.length || out.ok.length ? out : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One line per vehicle visit, oldest first. */
export function invoiceLines(jobs: { done_at: string; km: number | null; lines: { label: string; amount: number }[] | null; subtotal: number; vehicle_text: string | null;
  receipt_no: number | null; unit: string | null; plate: string | null; vin: string | null; inspection?: Parameters<typeof checksFrom>[0] }[]): InvoiceLine[] {
  return [...jobs].sort((a, b) => a.done_at.localeCompare(b.done_at)).map((j) => ({
    date: j.done_at.slice(0, 10), unit: j.unit, vehicle: j.vehicle_text || "", plate: j.plate, vin: j.vin, km: j.km, receiptNo: j.receipt_no,
    items: (j.lines ?? []).map((l) => ({ label: l.label, amount: r2(Number(l.amount)) })), amount: r2(Number(j.subtotal)),
    checks: checksFrom(j.inspection),
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

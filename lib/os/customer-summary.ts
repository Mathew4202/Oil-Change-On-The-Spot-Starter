// Customer list maths: visits, spend, last visit, next oil change due. Pure (tested in __tests__/customers.test.ts).

export type CustRow = { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null;
  sms_opt_out: boolean | null; created_at: string; source: string | null; vehicles: { year: number | null; make: string | null; model: string | null }[] | null };
export type JobLite = { customer_id: string | null; done_at: string; revenue: number | null; tip?: number | null; next_due_date: string | null };
export type BookLite = { customer_id: string | null; starts_at: string; status: string };
export type DueState = "overdue" | "soon" | "booked" | "ok" | "none";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const fullName = (c: { first_name: string | null; last_name: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "No name";
const days = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

/** Due soon = within 14 days. If they already have a booking coming up, it's "booked". */
export function dueState(nextDue: string | null, nextBooking: string | null, today: string): DueState {
  if (nextBooking) return "booked";
  if (!nextDue) return "none";
  const d = days(nextDue, today);
  return d < 0 ? "overdue" : d <= 14 ? "soon" : "ok";
}

export function summarizeCustomers(cs: CustRow[], jobs: JobLite[], bookings: BookLite[], today: string, halifaxDay: (ts: string) => string) {
  const byJob = new Map<string, JobLite[]>();
  for (const j of jobs) if (j.customer_id) (byJob.get(j.customer_id) ?? byJob.set(j.customer_id, []).get(j.customer_id)!).push(j);
  const nextBook = new Map<string, string>();
  for (const b of bookings) {
    if (!b.customer_id || ["cancelled", "done", "no_show"].includes(b.status)) continue;
    const d = halifaxDay(b.starts_at);
    if (d < today) continue;
    const cur = nextBook.get(b.customer_id);
    if (!cur || d < cur) nextBook.set(b.customer_id, d);
  }
  return cs.map((c) => {
    const js = (byJob.get(c.id) ?? []).sort((a, b) => b.done_at.localeCompare(a.done_at));
    const nextDue = js.find((j) => j.next_due_date)?.next_due_date ?? null;
    const nextBooking = nextBook.get(c.id) ?? null;
    return {
      id: c.id, name: fullName(c), phone: c.phone, email: c.email, address: c.address, smsOff: !!c.sms_opt_out, source: c.source,
      cars: (c.vehicles ?? []).map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ")).filter(Boolean),
      visits: js.length,
      spent: r2(js.reduce((t, j) => t + Number(j.revenue ?? 0), 0)),
      lastVisit: js[0] ? halifaxDay(js[0].done_at) : null,
      nextDue, nextBooking,
      due: dueState(nextDue, nextBooking, today),
    };
  });
}

/** Search across name, phone digits, email and cars. Every word has to match something. */
export function matches(c: { name: string; phone: string | null; email: string | null; cars: string[]; address: string | null }, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${c.name} ${c.email ?? ""} ${c.cars.join(" ")} ${c.address ?? ""}`.toLowerCase();
  const digits = (c.phone ?? "").replace(/\D/g, "");
  return words.every((w) => hay.includes(w) || (/^\d{3,}$/.test(w.replace(/\D/g, "")) && digits.includes(w.replace(/\D/g, ""))));
}

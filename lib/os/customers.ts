// Customers tab: list, one customer's full picture, edits, and merging duplicates.
import { sbGet, sbPatch, sbHeaders, enc } from "@/lib/os/db";
import { halifaxDate } from "@/lib/os/slots";
import { e164 } from "@/lib/os/booking";
import { summarizeCustomers, fullName, dueState, type CustRow, type JobLite, type BookLite } from "@/lib/os/customer-summary";

const day = (ts: string) => halifaxDate(new Date(ts));

export async function listCustomers() {
  const [cs, jobs, books] = await Promise.all([
    sbGet<CustRow>("customers?select=id,first_name,last_name,phone,email,address,sms_opt_out,created_at,source,vehicles(year,make,model)&order=first_name.asc&limit=5000"),
    sbGet<JobLite>("jobs?select=customer_id,done_at,revenue,tip,next_due_date&customer_id=not.is.null&limit=10000"),
    sbGet<BookLite>(`bookings?select=customer_id,starts_at,status&starts_at=gte.${new Date(Date.now() - 86400000).toISOString()}&limit=2000`),
  ]);
  return summarizeCustomers(cs, jobs, books, halifaxDate(new Date()), day);
}

export async function customerDetail(id: string) {
  const i = enc(id);
  const [[c], vehicles, jobs, bookings, texts] = await Promise.all([
    sbGet<CustRow & { notes: string | null; review_asked_at: string | null; city: string | null; sms_opt_out_at: string | null; sms_opt_out_by: string | null }>(
      `customers?select=id,first_name,last_name,phone,email,address,city,notes,sms_opt_out,sms_opt_out_at,sms_opt_out_by,created_at,source,review_asked_at,vehicles(year,make,model)&id=eq.${i}`),
    sbGet<{ id: string; year: number | null; make: string | null; model: string | null; engine: string | null; vin: string | null; last_km: number | null;
      vehicle_specs: { oil_grade: string | null; capacity_l: number | null; oil_filter_part: string | null; cabin_filter_part?: string | null; air_filter_part?: string | null;
        wiper_driver?: string | null; wiper_passenger?: string | null } | null }>(
      `vehicles?select=id,year,make,model,engine,vin,last_km,vehicle_specs(oil_grade,capacity_l,oil_filter_part,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger)&customer_id=eq.${i}&order=created_at.desc`)
      .catch(() => sbGet<never>(`vehicles?select=id,year,make,model,engine,vin,last_km,vehicle_specs(oil_grade,capacity_l,oil_filter_part)&customer_id=eq.${i}&order=created_at.desc`)),   // before migration 0026
    sbGet<{ id: string; done_at: string; revenue: number | null; hst: number | null; tip: number | null; total: number | null; service: string | null; vehicle_text: string | null;
      payment_method: string | null; receipt_token: string | null; receipt_no: number | null; imported_from: string | null; km: number | null;
      next_due_date: string | null; next_due_km: number | null; oil_grade: string | null; notes: string | null }>(
      `jobs?select=id,done_at,revenue,hst,tip,total,service,vehicle_text,payment_method,receipt_token,receipt_no,imported_from,km,next_due_date,next_due_km,oil_grade,notes&customer_id=eq.${i}&order=done_at.desc&limit=200`),
    sbGet<{ id: string; starts_at: string; status: string; quoted_total: number | null; services: { job?: string } | null; source: string | null }>(
      `bookings?select=id,starts_at,status,quoted_total,services,source&customer_id=eq.${i}&order=starts_at.desc&limit=100`),
    sbGet<{ kind: string | null; body: string | null; sent_at: string; status: string | null; channel: string | null; direction: string | null }>(
      `messages?select=kind,body,sent_at,status,channel,direction&customer_id=eq.${i}&order=sent_at.desc&limit=15`).catch(() => []),
  ]);
  if (!c) return null;
  const today = halifaxDate(new Date());
  const upcoming = bookings.filter((b) => !["cancelled", "done", "no_show"].includes(b.status) && day(b.starts_at) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const nextDue = jobs.find((j) => j.next_due_date)?.next_due_date ?? null;
  const spent = Math.round(jobs.reduce((t, j) => t + Number(j.revenue ?? 0), 0) * 100) / 100;
  return {
    customer: { id: c.id, firstName: c.first_name, lastName: c.last_name, name: fullName(c), phone: c.phone, email: c.email, address: c.address, notes: c.notes,
      smsOff: !!c.sms_opt_out, smsOffAt: c.sms_opt_out_at, smsOffBy: c.sms_opt_out_by, since: [day(c.created_at), ...jobs.map((j) => day(j.done_at)), ...bookings.map((b) => day(b.starts_at))].sort()[0],   // first time we saw them, not the import date
      source: c.source, reviewAsked: !!c.review_asked_at },
    stats: { visits: jobs.filter((j) => !["plan_payment", "cancellation_fee"].includes(String((j as { service?: string | null }).service ?? ""))).length, spent, average: jobs.length ? Math.round((spent / jobs.length) * 100) / 100 : 0,
      lastVisit: jobs[0] ? day(jobs[0].done_at) : null, nextDue, nextDueKm: jobs.find((j) => j.next_due_km)?.next_due_km ?? null,
      due: dueState(nextDue, upcoming[0] ? day(upcoming[0].starts_at) : null, today),
      cancelled: bookings.filter((b) => b.status === "cancelled").length, noShows: bookings.filter((b) => b.status === "no_show").length },
    vehicles: vehicles.map((v) => ({ id: v.id, name: [v.year, v.make, v.model].filter(Boolean).join(" ") || "Car", engine: v.engine, vin: v.vin, lastKm: v.last_km,
      oil: v.vehicle_specs ? [v.vehicle_specs.oil_grade, v.vehicle_specs.capacity_l ? `${v.vehicle_specs.capacity_l} L` : null].filter(Boolean).join(", ") : null,
      filter: v.vehicle_specs?.oil_filter_part ?? null,
      parts: v.vehicle_specs ? [v.vehicle_specs.cabin_filter_part && `Cabin ${v.vehicle_specs.cabin_filter_part}`, v.vehicle_specs.air_filter_part && `Air ${v.vehicle_specs.air_filter_part}`,
        (v.vehicle_specs.wiper_driver || v.vehicle_specs.wiper_passenger) && `Wipers ${[v.vehicle_specs.wiper_driver, v.vehicle_specs.wiper_passenger].filter(Boolean).join(" / ")}`].filter(Boolean).join(" · ") || null : null })),
    upcoming: upcoming.map((b) => ({ id: b.id, date: day(b.starts_at), at: b.starts_at, status: b.status, total: b.quoted_total, job: b.services?.job ?? null })),
    jobs: jobs.map((j) => ({ id: j.id, date: day(j.done_at), car: j.vehicle_text, service: j.service, amount: Number(j.revenue ?? 0), tip: Number(j.tip ?? 0),
      paidWith: j.payment_method, receipt: j.receipt_token ? `/receipt/${j.receipt_token}` : null, receiptNo: j.receipt_no, fromSheet: j.imported_from === "job_tracker",
      km: j.km, oil: j.oil_grade, notes: j.notes })),
    texts,
  };
}

export type CustomerEdit = { firstName?: string; lastName?: string; phone?: string; email?: string; address?: string; notes?: string; smsOff?: boolean };

export async function updateCustomer(id: string, e: CustomerEdit, by?: string) {
  const patch: Record<string, unknown> = {};
  if (e.firstName !== undefined) patch.first_name = e.firstName.trim().slice(0, 60) || null;
  if (e.lastName !== undefined) patch.last_name = e.lastName.trim().slice(0, 60) || null;
  if (e.email !== undefined) {
    const m = e.email.trim().toLowerCase();
    if (m && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) return { ok: false as const, error: "That email doesn't look right" };
    patch.email = m || null;
  }
  if (e.address !== undefined) patch.address = e.address.trim().slice(0, 200) || null;
  if (e.notes !== undefined) patch.notes = e.notes.trim().slice(0, 2000) || null;
  if (e.smsOff !== undefined) { patch.sms_opt_out = !!e.smsOff; patch.sms_opt_out_at = e.smsOff ? new Date().toISOString() : null; patch.sms_opt_out_by = e.smsOff ? by ?? "owner" : null; }
  if (e.phone !== undefined) {
    const digits = e.phone.replace(/\D/g, "");
    if (digits && digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) return { ok: false as const, error: "Phone needs 10 digits" };
    const p = digits ? e164(digits) : null;
    if (p) {
      const [other] = await sbGet<{ id: string; first_name: string | null; last_name: string | null }>(`customers?select=id,first_name,last_name&phone=eq.${enc(p)}&id=neq.${enc(id)}`);
      if (other) return { ok: false as const, error: `${fullName(other)} already has that number. If it's the same person, use "Same person as…" to merge them.`, otherId: other.id };
    }
    patch.phone = p;
  }
  return (await sbPatch("customers", `id=eq.${enc(id)}`, patch)) ? { ok: true as const } : { ok: false as const, error: "Couldn't save" };
}

/** Same person twice (e.g. "Rod smith" from the sheet and "Rod Smith" from Square): move everything onto one and remove the other. */
export async function mergeCustomers(fromId: string, intoId: string) {
  if (fromId === intoId) return { ok: false as const, error: "Pick a different customer" };
  type C = { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null; square_customer_id: string | null };
  const cols = "id,first_name,last_name,phone,email,address,notes,square_customer_id";
  const [[from], [into]] = await Promise.all([sbGet<C>(`customers?select=${cols}&id=eq.${enc(fromId)}`), sbGet<C>(`customers?select=${cols}&id=eq.${enc(intoId)}`)]);
  if (!from || !into) return { ok: false as const, error: "Customer not found" };
  // free up the unique fields first so they can move across
  await sbPatch("customers", `id=eq.${enc(fromId)}`, { phone: null, square_customer_id: null });
  for (const t of ["vehicles", "bookings", "jobs", "messages"]) await sbPatch(t, `customer_id=eq.${enc(fromId)}`, { customer_id: intoId });
  await sbPatch("customers", `id=eq.${enc(intoId)}`, {
    first_name: into.first_name || from.first_name, last_name: into.last_name || from.last_name,
    phone: into.phone || from.phone, email: into.email || from.email, address: into.address || from.address,
    square_customer_id: into.square_customer_id || from.square_customer_id,
    notes: [into.notes, from.notes].filter(Boolean).join("\n") || null,
  });
  const res = await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/customers?id=eq.${enc(fromId)}`, { method: "DELETE", headers: sbHeaders() });
  return res.ok ? { ok: true as const } : { ok: false as const, error: "Moved everything, but couldn't remove the old record" };
}

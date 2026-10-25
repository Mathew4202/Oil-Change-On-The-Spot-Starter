// Fleet accounts: their vehicles (unit numbers, agreed prices, when each is due), booking several vehicles
// in one visit at the yard, and invoices (one a month, or one per job for fleets that come through BBL).
import crypto from "crypto";
import { Resend } from "resend";
import { sbGet, sbInsert, sbPatch, sbRpc, enc } from "@/lib/os/db";
import { buildQuote } from "@/lib/os/quote-service";
import { createBooking, e164 } from "@/lib/os/booking";
import { jobMinutes } from "@/lib/os/calendar";
import { recordPayment } from "@/lib/os/jobs";
import { pushToOwners } from "@/lib/os/push";
import { siteUrl } from "@/lib/os/customer-texts";
import { decodeVin } from "@/lib/os/vin-photo";
import { vinOk, cleanVin } from "@/lib/os/vin";
import { halifaxDate } from "@/lib/os/slots";
import { invoiceLines, invoiceTotals, dueState, type InvoiceLine } from "@/lib/os/fleet-math";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Account = {
  id: string; business_name: string; contact_name: string | null; phone: string | null; email: string | null; invoice_email: string | null;
  address: string | null; billing: "monthly" | "per_job"; terms_days: number; service_every_months: number; via: string | null; notes: string | null; active: boolean;
};
export type FleetVehicle = {
  id: string; unit_number: string | null; year: number | null; make: string | null; model: string | null; engine: string | null; vin: string | null;
  plate: string | null; fleet_price: number | null; last_km: number | null; notes: string | null; active: boolean;
};
const ACC = "id,business_name,contact_name,phone,email,invoice_email,address,billing,terms_days,service_every_months,via,notes,active";
const VEH = "id,unit_number,year,make,model,engine,vin,plate,fleet_price,last_km,notes,active";

/** All fleet accounts with what needs attention: vehicles due, jobs not invoiced yet, invoices not paid. */
export async function listAccounts() {
  const accounts = await sbGet<Account>(`fleet_accounts?select=${ACC}&order=business_name`);
  const out = [];
  for (const a of accounts) {
    const d = await accountDetail(a.id);
    out.push({ ...a, vehicles: d?.vehicles.length ?? 0, due: d?.vehicles.filter((v) => v.due.state === "due" || v.due.state === "soon").length ?? 0,
      unbilled: d?.unbilled.length ?? 0, unbilledTotal: r2((d?.unbilled ?? []).reduce((t, j) => t + j.total, 0)),
      owing: r2((d?.invoices ?? []).filter((i) => i.status === "open").reduce((t, i) => t + Number(i.total), 0)) });
  }
  const requests = await sbGet<{ id: string; company: string; contact_name: string; phone: string; email: string | null; vehicles: number | null; vehicle_types: string | null;
    services: string[]; address: string | null; notes: string | null; status: string; created_at: string }>(
    "fleet_requests?select=id,company,contact_name,phone,email,vehicles,vehicle_types,services,address,notes,status,created_at&status=in.(new,contacted,quoted)&order=created_at.desc").catch(() => []);
  return { accounts: out, requests };
}

type JobRow = { id: string; done_at: string; km: number | null; service: string | null; lines: { label: string; amount: number }[] | null; subtotal: number; hst: number; total: number;
  vehicle_id: string | null; vehicle_text: string | null; booking_id: string | null; invoice_id: string | null; receipt_no: number | null };

export async function accountDetail(id: string) {
  const [a] = await sbGet<Account>(`fleet_accounts?select=${ACC}&id=eq.${enc(id)}`);
  if (!a) return null;
  const vehicles = await sbGet<FleetVehicle>(`vehicles?select=${VEH}&fleet_account_id=eq.${a.id}&order=unit_number.asc.nullslast,year.desc`);
  const ids = vehicles.map((v) => v.id);
  const jobs = ids.length ? await sbGet<JobRow>(`jobs?select=id,done_at,km,service,lines,subtotal,hst,total,vehicle_id,vehicle_text,booking_id,invoice_id,receipt_no&vehicle_id=in.(${ids.join(",")})&order=done_at.desc&limit=500`) : [];
  const upcoming = ids.length ? await sbGet<{ id: string; starts_at: string; vehicle_id: string; status: string }>(
    `bookings?select=id,starts_at,vehicle_id,status&vehicle_id=in.(${ids.join(",")})&status=in.(confirmed,requested,in_progress)&starts_at=gte.${new Date(Date.now() - 86400000).toISOString()}&order=starts_at`) : [];
  const invoices = await sbGet<{ id: string; invoice_no: number; token: string; period_start: string | null; period_end: string | null; issued_at: string; due_at: string | null;
    total: number; status: string; sent_at: string | null; paid_at: string | null; paid_method: string | null }>(
    `invoices?select=id,invoice_no,token,period_start,period_end,issued_at,due_at,total,status,sent_at,paid_at,paid_method&fleet_account_id=eq.${a.id}&order=issued_at.desc&limit=50`).catch(() => []);
  const today = halifaxDate(new Date());
  vehicles.sort((x, y) => (x.unit_number ?? "~").localeCompare(y.unit_number ?? "~", undefined, { numeric: true }));
  const withDue = vehicles.map((v) => {
    const last = jobs.find((j) => j.vehicle_id === v.id && j.service !== "cancellation_fee");
    const next = upcoming.find((b) => b.vehicle_id === v.id);
    return { ...v, fleet_price: v.fleet_price != null ? Number(v.fleet_price) : null, lastService: last?.done_at ?? null, lastKm: last?.km ?? v.last_km,
      booked: next?.starts_at ?? null, due: dueState(last?.done_at ?? null, a.service_every_months, today, !!next) };
  });
  const unbilled = jobs.filter((j) => !j.invoice_id && j.service !== "cancellation_fee").map((j) => ({ ...j, subtotal: Number(j.subtotal), hst: Number(j.hst), total: Number(j.total) }));
  return { account: a, vehicles: withDue, unbilled, invoices, history: jobs.slice(0, 60) };
}

const clean = (s: unknown, n = 200) => (typeof s === "string" ? s.trim().slice(0, n) : "") || null;

export async function saveAccount(input: Record<string, unknown>) {
  const row = {
    business_name: clean(input.business_name, 120) ?? "", contact_name: clean(input.contact_name, 80), phone: input.phone ? e164(String(input.phone)) : null,
    email: clean(input.email, 120), invoice_email: clean(input.invoice_email, 120), address: clean(input.address), via: clean(input.via, 80), notes: clean(input.notes, 1000),
    billing: input.billing === "per_job" ? "per_job" : "monthly",
    terms_days: Math.min(90, Math.max(0, Math.round(Number(input.terms_days ?? 30)))),
    service_every_months: Math.min(12, Math.max(1, Math.round(Number(input.service_every_months ?? 4)))),
  };
  if (!row.business_name) return { ok: false as const, error: "Add the business name" };
  if (input.id) {
    await sbPatch("fleet_accounts", `id=eq.${enc(String(input.id))}`, row);
    return { ok: true as const, id: String(input.id) };
  }
  const r = await sbInsert<{ id: string }>("fleet_accounts", row);
  if (!r.ok) return { ok: false as const, error: "Couldn't save the account" };
  if (input.fromRequest) await sbPatch("fleet_requests", `id=eq.${enc(String(input.fromRequest))}`, { status: "won" }).catch(() => null);
  return { ok: true as const, id: r.data!.id };
}

/** Add or edit a vehicle. A VIN fills in year, make, model and engine when they're left empty. */
export async function saveVehicle(accountId: string, input: Record<string, unknown>) {
  const vin = vinOk(String(input.vin || "")) ? cleanVin(String(input.vin)) : null;
  if (input.vin && !vin) return { ok: false as const, error: "That VIN doesn't look right (17 letters and numbers, no I, O or Q)" };
  const d = vin && (!input.year || !input.make || !input.model) ? await decodeVin(vin).catch(() => null) : null;
  const row = {
    fleet_account_id: accountId, unit_number: clean(input.unit_number, 30), vin, plate: clean(input.plate, 15)?.toUpperCase() ?? null,
    year: Number(input.year) || d?.year || null, make: clean(input.make, 40) ?? d?.make ?? null, model: clean(input.model, 60) ?? d?.model ?? null,
    engine: clean(input.engine, 60) ?? (d?.engineL ? `${d.engineL}L${/diesel/i.test(d.fuel || "") ? " diesel" : ""}` : null),
    fleet_price: input.fleet_price === "" || input.fleet_price == null ? null : r2(Number(input.fleet_price)),
    notes: clean(input.notes, 500), active: input.active !== false,
  };
  if (!row.year || !row.make || !row.model) return { ok: false as const, error: "Add the year, make and model, or a VIN we can read them from" };
  if (input.id) { await sbPatch("vehicles", `id=eq.${enc(String(input.id))}&fleet_account_id=eq.${accountId}`, row); return { ok: true as const, id: String(input.id), decoded: d }; }
  const r = await sbInsert<{ id: string }>("vehicles", row);
  return r.ok ? { ok: true as const, id: r.data!.id, decoded: d } : { ok: false as const, error: "Couldn't save the vehicle" };
}

/** What we'd normally charge for this vehicle's oil change (before HST), so you can set a fleet price next to it. */
export async function normalPrice(v: Pick<FleetVehicle, "year" | "make" | "model" | "engine">) {
  if (!v.year || !v.make || !v.model) return null;
  const { quote, spec } = await buildQuote({ year: v.year, make: v.make, model: v.model, engine: v.engine, job: "oil_change", addons: [], own: null, km: null });
  return { price: Number(quote.lines[0]?.amount ?? quote.subtotal), cost: quote.cost, oil: spec ? `${spec.oil_grade}, ${Number(spec.capacity_l)} L` : null };
}

/** Book a visit at the yard: the picked vehicles one after another, each its own job, billed to the fleet. */
export async function bookFleetVisit(accountId: string, vehicleIds: string[], startIso: string, owner: string, note?: string) {
  const d = await accountDetail(accountId);
  if (!d) return { ok: false as const, error: "Account not found" };
  const a = d.account;
  if (!a.address) return { ok: false as const, error: "Add the yard address to the account first" };
  if (!a.phone) return { ok: false as const, error: "Add the contact's phone number to the account first" };
  const picked = vehicleIds.map((id) => d.vehicles.find((v) => v.id === id)).filter(Boolean) as typeof d.vehicles;
  if (!picked.length) return { ok: false as const, error: "Pick at least one vehicle" };
  if (picked.length > 12) return { ok: false as const, error: "Book 12 vehicles or fewer per visit" };
  const [first, ...rest] = (a.contact_name || a.business_name).split(/\s+/);
  // the contact person is the customer record, tied to the account
  let [cust] = await sbGet<{ id: string }>(`customers?select=id&fleet_account_id=eq.${a.id}&limit=1`);
  if (!cust) [cust] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(a.phone)}`);
  if (cust) await sbPatch("customers", `id=eq.${cust.id}`, { fleet_account_id: a.id });
  else {
    const c = await sbInsert<{ id: string }>("customers", { first_name: first || a.business_name, last_name: rest.join(" ") || null, phone: a.phone, email: a.email,
      address: a.address, source: "fleet", fleet_account_id: a.id, notes: a.business_name });
    if (!c.ok) return { ok: false as const, error: "Couldn't save the fleet contact" };
    cust = c.data!;
  }
  const groupId = crypto.randomUUID();
  const made: string[] = [];
  let next = new Date(startIso).toISOString();
  for (const v of picked) {
    const r = await createBooking({
      firstName: first || a.business_name, lastName: rest.join(" "), phone: a.phone, email: a.email || "", address: a.address,
      car: { year: v.year!, make: v.make!, model: v.model!, ...(v.engine ? { engine: v.engine } : {}) }, job: "oil_change", addons: [], own: null,
      start: next, cars: 1, payMode: "after", notes: [v.unit_number ? `Unit ${v.unit_number}` : "", note || ""].filter(Boolean).join(" · ") || undefined,
    }, { source: owner === "fleet" ? "website" : "phone", bookedBy: owner === "fleet" ? undefined : owner, anyTime: true, customerId: cust.id, priceOverride: v.fleet_price ?? null, groupId, noTravel: true, silent: true,
      vehicleId: v.id, fleetAccountId: a.id });
    if (!r.ok) {
      for (const id of made) await sbPatch("bookings", `id=eq.${id}`, { status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "system: rest of the fleet visit couldn't be booked" });
      return { ok: false as const, error: r.status === 409 ? "That time overlaps another job. Pick another time." : r.error };
    }
    made.push(r.bookingId);
    next = r.end!;
  }
  const title = owner === "fleet" ? `${a.business_name} booked online: ${picked.length} vehicle${picked.length > 1 ? "s" : ""}`
    : `${owner[0].toUpperCase()}${owner.slice(1)} booked ${a.business_name}: ${picked.length} vehicle${picked.length > 1 ? "s" : ""}`;
  const body = `${new Date(startIso).toLocaleString("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} at ${a.address}`;
  try { await sbInsert("notifications", { kind: "new_booking", booking_id: made[0], title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url: `/owner?date=${halifaxDate(new Date(startIso))}`, tag: made[0] }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
  return { ok: true as const, bookings: made, ends: next };
}

/** How long a fleet visit takes, for the time picker. */
export async function visitMinutes(count: number) {
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  return jobMinutes("oil_change", rules, []) * count;
}

/** Make invoices for finished, not-yet-invoiced jobs: one for the month (monthly accounts) or one per job (per_job). */
export async function makeInvoices(accountId: string, jobIds?: string[]) {
  const d = await accountDetail(accountId);
  if (!d) return { ok: false as const, error: "Account not found" };
  const jobs = d.unbilled.filter((j) => !jobIds?.length || jobIds.includes(j.id));
  if (!jobs.length) return { ok: false as const, error: "Nothing to invoice yet. Finish the jobs first." };
  const unitOf = Object.fromEntries(d.vehicles.map((v) => [v.id, v]));
  const groups = d.account.billing === "per_job" ? jobs.map((j) => [j]) : [jobs];
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  const made: { id: string; invoice_no: number; token: string; total: number }[] = [];
  for (const g of groups) {
    const lines: InvoiceLine[] = invoiceLines(g.map((j) => ({ ...j, unit: j.vehicle_id ? unitOf[j.vehicle_id]?.unit_number ?? null : null,
      plate: j.vehicle_id ? unitOf[j.vehicle_id]?.plate ?? null : null, vin: j.vehicle_id ? unitOf[j.vehicle_id]?.vin ?? null : null })));
    const t = invoiceTotals(lines, Number(rules.hst_rate ?? 0.14));
    const dates = g.map((j) => j.done_at.slice(0, 10)).sort();
    const no = await sbRpc<number>("next_invoice_no");
    const token = crypto.randomBytes(18).toString("base64url");
    const due = new Date(Date.now() + d.account.terms_days * 86400000).toISOString().slice(0, 10);
    const r = await sbInsert<{ id: string }>("invoices", { fleet_account_id: accountId, invoice_no: no, token, period_start: dates[0], period_end: dates[dates.length - 1],
      due_at: due, lines, subtotal: t.subtotal, hst: t.hst, total: t.total });
    if (!r.ok) return { ok: false as const, error: "Couldn't make the invoice" };
    await sbPatch("jobs", `id=in.(${g.map((j) => j.id).join(",")})`, { invoice_id: r.data!.id, payment_method: "invoice" });
    made.push({ id: r.data!.id, invoice_no: no, token, total: t.total });
  }
  return { ok: true as const, invoices: made };
}

export async function invoiceByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [inv] = await sbGet<{ id: string; invoice_no: number; token: string; period_start: string | null; period_end: string | null; issued_at: string; due_at: string | null;
    lines: InvoiceLine[]; subtotal: number; hst: number; total: number; status: string; paid_at: string | null; fleet_account_id: string }>(
    `invoices?select=*&token=eq.${enc(token)}`);
  if (!inv) return null;
  const [a] = await sbGet<Account>(`fleet_accounts?select=${ACC}&id=eq.${inv.fleet_account_id}`);
  return { invoice: inv, account: a };
}

/** Email the invoice link (a printable page) to the account's invoice address. */
export async function sendInvoice(invoiceId: string, to?: string | null) {
  const [inv] = await sbGet<{ id: string; invoice_no: number; token: string; total: number; due_at: string | null; fleet_account_id: string }>(
    `invoices?select=id,invoice_no,token,total,due_at,fleet_account_id&id=eq.${enc(invoiceId)}`);
  if (!inv) return { sent: false, reason: "invoice not found" };
  const [a] = await sbGet<Account>(`fleet_accounts?select=${ACC}&id=eq.${inv.fleet_account_id}`);
  const email = (to || a?.invoice_email || a?.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { sent: false, reason: "no email on the account" };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "email isn't set up yet" };
  const link = `${siteUrl()}/invoice/${inv.token}`;
  const text = `Hi${a?.contact_name ? ` ${a.contact_name.split(" ")[0]}` : ""},\n\nHere is invoice #${inv.invoice_no} from Oil Change On The Spot for $${Number(inv.total).toFixed(2)} (HST included)${inv.due_at ? `, due ${inv.due_at}` : ""}.\n\nView, print or pay it by card here: ${link}\nOr pay by e-transfer to ${process.env.ETRANSFER_EMAIL || "oilchangeonthespot@gmail.com"} with the invoice number in the message.\n\nThank you,\nMathew\nOil Change On The Spot`;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.EMAIL_FROM || "Oil Change On The Spot <onboarding@resend.dev>", to: email,
      replyTo: process.env.NOTIFY_TO || process.env.EMAIL_TO || undefined, subject: `Invoice #${inv.invoice_no} from Oil Change On The Spot`, text });
  } catch (e) { return { sent: false, reason: String(e).slice(0, 120) }; }
  await sbPatch("invoices", `id=eq.${inv.id}`, { sent_at: new Date().toISOString(), sent_to: email });
  return { sent: true, to: email };
}

/** Mark an invoice paid: every job on it is recorded as paid, so Money and the calendar stay right. */
export async function markInvoicePaid(invoiceId: string, method: string, owner: string) {
  const m = ["etransfer", "cheque", "card_terminal", "cash", "card_online"].includes(method) ? method : "etransfer";
  const [inv] = await sbGet<{ id: string; status: string }>(`invoices?select=id,status&id=eq.${enc(invoiceId)}`);
  if (!inv) return { ok: false as const, error: "Invoice not found" };
  if (inv.status === "paid") return { ok: true as const };
  const jobs = await sbGet<{ booking_id: string | null; total: number }>(`jobs?select=booking_id,total&invoice_id=eq.${inv.id}`);
  for (const j of jobs) if (j.booking_id) await recordPayment(j.booking_id, Number(j.total), m, owner, 0);
  await sbPatch("invoices", `id=eq.${inv.id}`, { status: "paid", paid_at: new Date().toISOString(), paid_method: m });
  return { ok: true as const };
}

export async function voidInvoice(invoiceId: string) {
  const [inv] = await sbGet<{ id: string; status: string }>(`invoices?select=id,status&id=eq.${enc(invoiceId)}`);
  if (!inv || inv.status === "paid") return { ok: false as const, error: "A paid invoice can't be cancelled" };
  await sbPatch("jobs", `invoice_id=eq.${inv.id}`, { invoice_id: null, payment_method: null });
  await sbPatch("invoices", `id=eq.${inv.id}`, { status: "void" });
  return { ok: true as const };
}

// The fleet's own page: a private link per account (no password). Everything a fleet manager needs without calling us.
import crypto from "crypto";
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { accountDetail, bookFleetVisit, saveVehicle, visitMinutes } from "@/lib/os/fleet";
import { dayAvailability } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
import { sendSms, template, fill } from "@/lib/os/sms";
import { siteUrl, when as whenText } from "@/lib/os/customer-texts";
import { pushToOwners } from "@/lib/os/push";

export const portalLink = (token: string) => `${siteUrl()}/fleet/${token}`;

export async function accountByPortal(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [a] = await sbGet<{ id: string; active: boolean }>(`fleet_accounts?select=id,active&portal_token=eq.${enc(token)}`).catch(() => []);
  return a && a.active !== false ? a.id : null;
}

/** The link for an account (made the first time). reset = old link stops working. */
export async function ensurePortal(accountId: string, reset = false) {
  const [a] = await sbGet<{ portal_token: string | null }>(`fleet_accounts?select=portal_token&id=eq.${enc(accountId)}`);
  if (!a) return null;
  let token = a.portal_token;
  if (!token || reset) {
    token = crypto.randomBytes(18).toString("base64url");
    await sbPatch("fleet_accounts", `id=eq.${enc(accountId)}`, { portal_token: token });
  }
  return portalLink(token);
}

export async function textPortal(accountId: string) {
  const link = await ensurePortal(accountId);
  const d = await accountDetail(accountId);
  if (!link || !d) return { ok: false as const, error: "Account not found" };
  if (!d.account.phone) return { ok: false as const, error: "Add the contact's mobile number first" };
  const body = (await template("fleet_portal")) || "Hi {first_name}, here is your {business} page with Oil Change On The Spot: {link}\n- Mathew, Oil Change On The Spot";
  const r = await sendSms(d.account.phone, fill(body, { first_name: (d.account.contact_name || "there").split(/\s+/)[0], business: d.account.business_name, link }), { kind: "fleet_portal" });
  await sbPatch("fleet_accounts", `id=eq.${enc(accountId)}`, { portal_sent_at: new Date().toISOString() }).catch(() => null);
  return { ok: true as const, link, sms: r };
}

/** What the fleet sees. Our cost, profit and notes never leave HQ. */
export async function portalView(accountId: string) {
  const d = await accountDetail(accountId);
  if (!d) return null;
  const a = d.account;
  const name = (id: string | null) => { const v = d.vehicles.find((x) => x.id === id); return v ? [v.unit_number ? `Unit ${v.unit_number}` : null, [v.year, v.make, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") : null; };
  const ids = d.vehicles.map((v) => v.id);
  const upcoming = ids.length ? await sbGet<{ id: string; starts_at: string; vehicle_id: string; status: string; address: string | null }>(
    `bookings?select=id,starts_at,vehicle_id,status,address&vehicle_id=in.(${ids.join(",")})&status=in.(confirmed,requested)&starts_at=gte.${new Date().toISOString()}&order=starts_at`) : [];
  return {
    account: { name: a.business_name, contact: a.contact_name, address: a.address, billing: a.billing, terms: a.terms_days, every: a.service_every_months },
    vehicles: d.vehicles.filter((v) => v.active !== false).map((v) => ({ id: v.id, unit: v.unit_number, car: [v.year, v.make, v.model].filter(Boolean).join(" "), engine: v.engine,
      plate: v.plate, vin: v.vin, price: v.fleet_price, lastService: v.lastService, lastKm: v.lastKm, booked: v.booked, due: v.due })),
    upcoming: upcoming.map((b) => ({ id: b.id, at: b.starts_at, vehicle: name(b.vehicle_id) })),
    history: d.history.filter((j) => j.service !== "cancellation_fee").map((j) => ({ date: halifaxDate(new Date(j.done_at)), vehicle: name(j.vehicle_id) ?? j.vehicle_text, km: j.km,
      work: (j.lines ?? []).filter((l) => !/^Travel/.test(l.label)).map((l) => l.label).join(", ") || j.service, total: Number(j.total), invoiced: !!j.invoice_id })),
    invoices: d.invoices.filter((i) => i.status !== "void").map((i) => ({ no: i.invoice_no, link: `/invoice/${i.token}`, issued: i.issued_at.slice(0, 10), due: i.due_at, total: Number(i.total), status: i.status,
      overdue: i.status === "open" && !!i.due_at && i.due_at < halifaxDate(new Date()) })),
    owing: Math.round(d.invoices.filter((i) => i.status === "open").reduce((t, i) => t + Number(i.total), 0) * 100) / 100,
  };
}

export async function portalTimes(accountId: string, date: string, count: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] };
  const minutes = await visitMinutes(Math.min(12, Math.max(1, count)));
  return dayAvailability(date, { cars: 1, minutes, filterInStock: false });
}

/** Book from the portal: only at a time that's actually open, then one text to the fleet contact. */
export async function portalBook(accountId: string, vehicleIds: string[], startIso: string, note: string) {
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return { ok: false as const, error: "Pick a time" };
  const day = halifaxDate(start);
  const open = await portalTimes(accountId, day, vehicleIds.length) as { slots?: { start: string }[] };
  if (!(open.slots ?? []).some((s) => new Date(s.start).getTime() === start.getTime())) return { ok: false as const, error: "That time was just taken. Pick another one." };
  const r = await bookFleetVisit(accountId, vehicleIds, start.toISOString(), "fleet", note);
  if (!r.ok) return r;
  const d = await accountDetail(accountId);
  if (d?.account.phone) {
    const body = (await template("fleet_booked")) || "Hi {first_name}, your yard visit is booked for {when} at {address}: {count}.\n- Mathew, Oil Change On The Spot";
    await sendSms(d.account.phone, fill(body, { first_name: (d.account.contact_name || "there").split(/\s+/)[0], when: whenText(start.toISOString()), address: d.account.address || "your yard",
      count: `${vehicleIds.length} vehicle${vehicleIds.length > 1 ? "s" : ""}` }), { kind: "fleet_booked", bookingId: r.bookings[0] }).catch(() => null);
  }
  return r;
}

/** The fleet adds a vehicle themselves (a VIN fills in the rest). We get a buzz so we can set its price. */
export async function portalAddVehicle(accountId: string, input: Record<string, unknown>) {
  const r = await saveVehicle(accountId, { unit_number: input.unit_number, vin: input.vin, plate: input.plate, year: input.year, make: input.make, model: input.model });
  if (r.ok) {
    const d = await accountDetail(accountId);
    await Promise.race([pushToOwners({ title: `${d?.account.business_name ?? "A fleet"} added a vehicle`, body: "Set its fleet price on the Fleets screen.", url: `/owner/fleets/${accountId}`, tag: r.id }).catch(() => null),
      new Promise((x) => setTimeout(x, 3000))]);
  }
  return r;
}

// The fleet's own page: a private link per account (no password). Everything a fleet manager needs without calling us.
import crypto from "crypto";
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { accountDetail, bookFleetVisit, saveVehicle, saveVehicles, visitMinutes } from "@/lib/os/fleet";
import { dayAvailability } from "@/lib/os/calendar";
import { checksFrom } from "@/lib/os/fleet-math";
import { halifaxDate } from "@/lib/os/slots";
import { sendSms, template, fill } from "@/lib/os/sms";
import { Resend } from "resend";
import { emailFrom } from "@/lib/os/email-from";
import { signed } from "@/lib/os/signer";
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

/** Send the fleet their page: a text to the contact's mobile AND an email (fleet offices mostly work on a laptop). */
export async function textPortal(accountId: string) {
  const link = await ensurePortal(accountId);
  const d = await accountDetail(accountId);
  if (!link || !d) return { ok: false as const, error: "Account not found" };
  const a = d.account;
  const first = (a.contact_name || "there").split(/\s+/)[0];
  const to = (a.email || a.invoice_email || "").trim();
  if (!a.phone && !to) return { ok: false as const, error: "Add the contact's mobile number or email first" };
  const sms = a.phone
    ? await sendSms(a.phone, fill((await template("fleet_portal")) || "Hi {first_name}, here is your {business} page with Oil Change On The Spot: {link}\n- {signer}, Oil Change On The Spot", { first_name: first, business: a.business_name, link }), { kind: "fleet_portal" })
    : null;
  const email = to ? await emailPortal(to, first, a.business_name, link) : { sent: false, reason: "no email on the account" };
  await sbPatch("fleet_accounts", `id=eq.${enc(accountId)}`, { portal_sent_at: new Date().toISOString() }).catch(() => null);
  return { ok: true as const, link, sms, email, to: to || null };
}

async function emailPortal(to: string, first: string, business: string, link: string): Promise<{ sent: boolean; reason?: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, reason: "email doesn't look right" };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "email service not set up" };
  const text = await signed(fill((await template("fleet_portal_email")) || "Hi {first_name},\n\nHere is the {business} page with Oil Change On The Spot: {link}\n\n{signer}\nOil Change On The Spot", { first_name: first, business, link }));
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.5;color:#0d1b3e;max-width:560px">
    ${esc(text).split(link).join(`</p><p><a href="${link}" style="display:inline-block;background:#f2b01e;color:#0d1b3e;font-weight:800;padding:12px 20px;border-radius:10px;text-decoration:none">Open your fleet page</a></p><p>`).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>").replace(/^/, "<p>")}</p></div>`;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: emailFrom(), to, replyTo: process.env.NOTIFY_TO || process.env.EMAIL_TO || undefined,
      subject: `Your ${business} page with Oil Change On The Spot`, html, text });
    return { sent: true };
  } catch (e) { return { sent: false, reason: String(e).slice(0, 120) }; }
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
      plate: v.plate, vin: v.vin, price: v.fleet_price, lastService: v.lastService, lastKm: v.lastKm, booked: v.booked, due: v.due,
      // what we found on the last visit (Now / Soon), so the fleet knows before it becomes a breakdown
      checks: checksFrom(d.history.find((j) => j.vehicle_id === v.id && j.service !== "cancellation_fee")?.inspection ?? null) })),
    upcoming: upcoming.map((b) => ({ id: b.id, at: b.starts_at, vehicle: name(b.vehicle_id) })),
    history: d.history.filter((j) => j.service !== "cancellation_fee").map((j) => ({ date: halifaxDate(new Date(j.done_at)), vehicle: name(j.vehicle_id) ?? j.vehicle_text, km: j.km,
      work: (j.lines ?? []).filter((l) => !/^Travel/.test(l.label)).map((l) => l.label).join(", ") || j.service, total: Number(j.total), invoiced: !!j.invoice_id,
      checks: checksFrom(j.inspection ?? null) })),
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
    const body = (await template("fleet_booked")) || "Hi {first_name}, your yard visit is booked for {when} at {address}: {count}.\n- {signer}, Oil Change On The Spot";
    await sendSms(d.account.phone, fill(body, { first_name: (d.account.contact_name || "there").split(/\s+/)[0], when: whenText(start.toISOString()), address: d.account.address || "your yard",
      count: `${vehicleIds.length} vehicle${vehicleIds.length > 1 ? "s" : ""}` }), { kind: "fleet_booked", bookingId: r.bookings[0] }).catch(() => null);
  }
  return r;
}

/** The fleet adds a vehicle themselves (a VIN fills in the rest). We get a buzz so we can set its price. */
export async function portalAddVehicle(accountId: string, input: Record<string, unknown>) {
  const r = await saveVehicle(accountId, { unit_number: input.unit_number, vin: input.vin, plate: input.plate, year: input.year, make: input.make, model: input.model, engine: input.engine });
  if (r.ok) {
    const d = await accountDetail(accountId);
    await Promise.race([pushToOwners({ title: `${d?.account.business_name ?? "A fleet"} added a vehicle`, body: "Set its fleet price on the Fleets screen.", url: `/owner/fleets/${accountId}`, tag: r.id }).catch(() => null),
      new Promise((x) => setTimeout(x, 3000))]);
  }
  return r;
}

/** The fleet adds many vehicles at once (from a photo or file of their list). One buzz for us. */
export async function portalAddVehicles(accountId: string, rows: Record<string, unknown>[]) {
  const r = await saveVehicles(accountId, rows);
  if (r.saved) {
    const d = await accountDetail(accountId);
    await Promise.race([pushToOwners({ title: `${d?.account.business_name ?? "A fleet"} added ${r.saved} vehicle${r.saved > 1 ? "s" : ""}`, body: "Set their fleet prices on the Fleets screen.", url: `/owner/fleets/${accountId}`, tag: `${accountId}-bulk` }).catch(() => null),
      new Promise((x) => setTimeout(x, 3000))]);
  }
  return r;
}

/** "Fleet login": they type the mobile or email on their account and we text the link to the account's phone.
 *  Always answers the same way, so nobody can find out which numbers are fleet accounts. */
export async function sendPortalLink(contact: string) {
  const c = contact.trim();
  const digits = c.replace(/\D/g, "");
  const phone = digits.length >= 10 ? `+${digits.length === 10 ? `1${digits}` : digits}` : null;
  const email = /@/.test(c) ? c.toLowerCase() : null;
  if (!phone && !email) return { ok: false as const, error: "Enter the mobile number or email on your fleet account." };
  const or = [phone ? `phone.eq.${enc(phone)}` : "", email ? `email.ilike.${enc(email)}` : "", email ? `invoice_email.ilike.${enc(email)}` : ""].filter(Boolean).join(",");
  const [a] = await sbGet<{ id: string; phone: string | null; active: boolean; portal_sent_at: string | null }>(`fleet_accounts?select=id,phone,active,portal_sent_at&or=(${or})&limit=1`).catch(() => []);
  // one send a minute per account at most (text + email)
  if (a && a.active !== false && !(a.portal_sent_at && Date.now() - new Date(a.portal_sent_at).getTime() < 60000)) await textPortal(a.id).catch(() => null);
  return { ok: true as const };
}

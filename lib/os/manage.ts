// Change or cancel a booking (customer self-serve link, or owners in HQ).
import { sbGet, sbPatch, sbInsert, sbRpc, enc } from "@/lib/os/db";
import { dayAvailability, jobMinutes } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
import { pushToOwners } from "@/lib/os/push";
import crypto from "crypto";
import { textCustomer, when, payLink } from "@/lib/os/customer-texts";
import { releaseCredits } from "@/lib/os/referrals";
import { repriceForDate, type Priced } from "@/lib/os/deals";

export type ManagedBooking = {
  id: string; starts_at: string; ends_at: string; status: string; address: string | null; quoted_total: number | null; cars: number; vehicle_id?: string | null;
  services: { job?: string; addons?: string[] } | null;
  customers: { id: string; first_name: string | null; last_name: string | null; phone: string | null; sms_opt_out: boolean | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null } | null;
};

const SELECT = "id,starts_at,ends_at,status,address,quoted_total,cars,services,vehicle_id,customers(id,first_name,last_name,phone,sms_opt_out),vehicles(year,make,model)";

export async function bookingByToken(token: string) {
  const t = token.replace(/[^A-Za-z0-9_-]/g, "");
  if (t.length < 16) return null;
  const [b] = await sbGet<ManagedBooking>(`bookings?select=${SELECT}&manage_token=eq.${t}`);
  return b ?? null;
}
export async function bookingById(id: string) {
  const [b] = await sbGet<ManagedBooking>(`bookings?select=${SELECT}&id=eq.${enc(id)}`);
  return b ?? null;
}

async function rules() {
  return Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
}

/** Can the customer still change it online? (Owners always can.) */
export async function selfServeAllowed(b: ManagedBooking) {
  const r = await rules();
  const hours = r.free_cancel_hours ?? 24;
  const ok = ["confirmed", "requested"].includes(b.status) && new Date(b.starts_at).getTime() - Date.now() > hours * 3600000;
  return { ok, hours };
}

const carOf = (b: ManagedBooking) => [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "car";
const nameOf = (b: ManagedBooking) => [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(" ") || "Customer";

async function tellOwners(b: ManagedBooking, kind: string, title: string, body: string) {
  try { await sbInsert("notifications", { kind, booking_id: b.id, title, body }); } catch { /* alert is best effort */ }
  await Promise.race([pushToOwners({ title, body, url: `/owner?date=${halifaxDate(new Date(b.starts_at))}`, tag: `${b.id}-${kind}` }), new Promise((r) => setTimeout(r, 4000))]);
}

/** Cancelling on the day of the appointment (Halifax time). Our policy: 24 hours' notice, same-day may carry a $30 fee. */
export const isSameDay = (b: { starts_at: string }, now = new Date()) => halifaxDate(new Date(b.starts_at)) === halifaxDate(now);

/** The $30 + HST same-day fee: its own small job and receipt, so it shows in Money and the customer can pay it by link. */
async function chargeCancelFee(b: ManagedBooking) {
  const r = await rules();
  const fee = Number(r.same_day_cancel_fee ?? 30), rate = Number(r.hst_rate ?? 0.14);
  const hst = Math.round(fee * rate * 100) / 100, total = Math.round((fee + hst) * 100) / 100;
  const receiptNo = await sbRpc<number>("next_receipt_no");
  const token = crypto.randomBytes(18).toString("base64url");
  await sbInsert("jobs", { booking_id: b.id, customer_id: b.customers?.id ?? null, vehicle_id: b.vehicle_id ?? null,
    done_at: new Date().toISOString(), service: "cancellation_fee", revenue: fee, cost_oil: 0, cost_parts: 0, cost_other: 0,
    lines: [{ label: "Same-day cancellation fee", amount: fee }], subtotal: fee, hst, total, receipt_no: receiptNo, receipt_token: token,
    vehicle_text: carOf(b), done_by: "both" });
  await sbPatch("bookings", `id=eq.${b.id}`, { cancel_fee: fee, cancel_fee_waived: false });
  return { fee, total, token };
}

export async function cancelBooking(b: ManagedBooking, by: "customer" | string, reason?: string, opts: { chargeFee?: boolean } = {}) {
  if (!["confirmed", "requested", "in_progress"].includes(b.status)) return { ok: false, error: "This booking can't be cancelled anymore." };
  const sameDay = isSameDay(b);
  await sbPatch("bookings", `id=eq.${b.id}`, { status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: `${by}: ${reason || "no reason given"}`.slice(0, 300),
    ...(sameDay && by !== "customer" && !opts.chargeFee ? { cancel_fee_waived: true } : {}) });
  await releaseCredits(b.id);   // a referral credit used on it goes back on their account
  const fee = sameDay && by !== "customer" && opts.chargeFee ? await chargeCancelFee(b) : null;
  await tellOwners(b, "cancelled", `Cancelled: ${when(b.starts_at)}, ${carOf(b)}`, `${nameOf(b)}${by === "customer" ? " cancelled online" : ` (cancelled by ${by})`}${reason ? `: ${reason}` : ""}`);
  if (by !== "customer") await textCustomer("booking_cancelled", b.customers, { when: when(b.starts_at), car: carOf(b) }, b.id).catch(() => null);
  if (fee) await textCustomer("cancel_fee", b.customers, { fee: `$${fee.fee.toFixed(2)}`, total: `$${fee.total.toFixed(2)}`, pay_link: payLink(fee.token) }, b.id).catch(() => null);
  return { ok: true, fee: fee ? fee.total : null };
}

/** Other cars booked on the same visit (empty for a single car). */
export async function groupMembers(b: ManagedBooking): Promise<ManagedBooking[]> {
  try {
    const [me] = await sbGet<{ group_id: string | null }>(`bookings?select=group_id&id=eq.${b.id}`);
    if (!me?.group_id) return [];
    return await sbGet<ManagedBooking>(`bookings?select=${SELECT}&group_id=eq.${me.group_id}&status=in.(confirmed,requested,in_progress)&order=starts_at`);
  } catch { return []; }
}

/** Customer cancels a visit with several cars: every car on it is cancelled. */
export async function cancelGroup(members: ManagedBooking[], reason?: string) {
  for (const m of members) { const r = await cancelBooking(m, "customer", reason); if (!r.ok) return r; }
  return { ok: true };
}

/** Move a visit with several cars: they stay back to back in the same order. */
export async function moveGroup(members: ManagedBooking[], startIso: string, by: "customer" | string) {
  if (members.some((m) => !["confirmed", "requested"].includes(m.status))) return { ok: false, error: "This booking can't be changed anymore." };
  const start = new Date(startIso);
  if (isNaN(start.getTime()) || start.getTime() < Date.now()) return { ok: false, error: "Pick a time in the future." };
  const first = new Date(members[0].starts_at).getTime();
  const total = (new Date(members[members.length - 1].ends_at).getTime() - first) / 60000;
  if (by === "customer") {
    const day = await dayAvailability(halifaxDate(start), { cars: 1, minutes: total, filterInStock: false, ignoreBookingIds: members.map((m) => m.id) });
    if (!day.slots.some((s) => s.start === start.toISOString())) return { ok: false, error: "That time doesn't have room for all the cars. Please pick another." };
  }
  const shift = start.getTime() - first;
  // move in an order that never makes a car overlap its own sibling's old time
  const order = shift > 0 ? [...members].reverse() : members;
  for (const m of order) {
    const ok = await sbPatch("bookings", `id=eq.${m.id}`, { starts_at: new Date(new Date(m.starts_at).getTime() + shift).toISOString(),
      ends_at: new Date(new Date(m.ends_at).getTime() + shift).toISOString(), reminder_sent_at: null });
    if (!ok) return { ok: false, error: "That time overlaps another job. Pick a different time." };
  }
  await repriceMoved(members.map((m) => m.id));
  const cars = members.map(carOf).join(" and ");
  await tellOwners(members[0], "moved", `Moved: ${cars} to ${when(start.toISOString())}`, `${nameOf(members[0])} moved ${members.length} cars from ${when(members[0].starts_at)}${by === "customer" ? " (online)" : ` (by ${by})`}`);
  await textCustomer("booking_moved", members[0].customers, { when: when(start.toISOString()), car: cars }, members[0].id).catch(() => null);
  return { ok: true, start: start.toISOString() };
}

/** Move to a new start time. Customers must pick an open slot; owners can pick any free time. */
export async function moveBooking(b: ManagedBooking, startIso: string, by: "customer" | string) {
  if (!["confirmed", "requested"].includes(b.status)) return { ok: false, error: "This booking can't be changed anymore." };
  const start = new Date(startIso);
  if (isNaN(start.getTime()) || start.getTime() < Date.now()) return { ok: false, error: "Pick a time in the future." };
  const r = await rules();
  const minutes = jobMinutes(b.services?.job, r, b.services?.addons ?? []) * (b.cars || 1);
  let end = new Date(start.getTime() + minutes * 60000);
  if (by === "customer") {
    // free up this booking's own time while checking, so moving within the same day works
    const day = await dayAvailability(halifaxDate(start), { cars: b.cars, minutes: minutes / (b.cars || 1), filterInStock: true, ignoreBookingId: b.id });
    const slot = day.slots.find((s) => s.start === start.toISOString());
    if (!slot) return { ok: false, error: "That time isn't open. Please pick another." };
    end = new Date(slot.end);
  }
  const old = b.starts_at;
  const okPatch = await sbPatch("bookings", `id=eq.${b.id}`, { starts_at: start.toISOString(), ends_at: end.toISOString(), reminder_sent_at: null });
  if (!okPatch) return { ok: false, error: "That time overlaps another job. Pick a different time." };
  await repriceMoved([b.id]);
  await tellOwners(b, "moved", `Moved: ${carOf(b)} to ${when(start.toISOString())}`, `${nameOf(b)} moved from ${when(old)}${by === "customer" ? " (online)" : ` (by ${by})`}`);
  await textCustomer("booking_moved", b.customers, { when: when(start.toISOString()), car: carOf(b) }, b.id).catch(() => null);
  return { ok: true, start: start.toISOString() };
}

/** After a move: the Christmas deal goes by the visit day, so the price follows the booking (fleets keep their own prices). */
async function repriceMoved(ids: string[]) {
  if (!ids.length) return;
  const r = await rules();
  const rows = await sbGet<{ id: string; starts_at: string; cars: number; pay_mode: string; services: { job?: string } | null; quote_breakdown: Priced | null }>(
    `bookings?select=id,starts_at,cars,pay_mode,services,quote_breakdown&id=in.(${ids.join(",")})`).catch(() => []);
  for (const b of rows) {
    if (b.pay_mode === "fleet_invoice") continue;
    const q = repriceForDate(b.quote_breakdown, halifaxDate(new Date(b.starts_at)), b.services?.job, b.cars || 1, r, Number(r.hst_rate ?? 0.14));
    if (q) await sbPatch("bookings", `id=eq.${b.id}`, { quote_breakdown: q, quoted_total: q.total }).catch(() => null);
  }
}

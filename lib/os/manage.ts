// Change or cancel a booking (customer self-serve link, or owners in HQ).
import { sbGet, sbPatch, sbInsert, sbRpc, enc } from "@/lib/os/db";
import { dayAvailability, jobMinutes } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
import { pushToOwners } from "@/lib/os/push";
import crypto from "crypto";
import { textCustomer, when, payLink } from "@/lib/os/customer-texts";

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
  const fee = sameDay && by !== "customer" && opts.chargeFee ? await chargeCancelFee(b) : null;
  await tellOwners(b, "cancelled", `Cancelled: ${when(b.starts_at)}, ${carOf(b)}`, `${nameOf(b)}${by === "customer" ? " cancelled online" : ` (cancelled by ${by})`}${reason ? `: ${reason}` : ""}`);
  if (by !== "customer") await textCustomer("booking_cancelled", b.customers, { when: when(b.starts_at), car: carOf(b) }, b.id).catch(() => null);
  if (fee) await textCustomer("cancel_fee", b.customers, { fee: `$${fee.fee.toFixed(2)}`, total: `$${fee.total.toFixed(2)}`, pay_link: payLink(fee.token) }, b.id).catch(() => null);
  return { ok: true, fee: fee ? fee.total : null };
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
  await tellOwners(b, "moved", `Moved: ${carOf(b)} to ${when(start.toISOString())}`, `${nameOf(b)} moved from ${when(old)}${by === "customer" ? " (online)" : ` (by ${by})`}`);
  await textCustomer("booking_moved", b.customers, { when: when(start.toISOString()), car: carOf(b) }, b.id).catch(() => null);
  return { ok: true, start: start.toISOString() };
}

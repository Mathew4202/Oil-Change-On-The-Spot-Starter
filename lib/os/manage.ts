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

/**
 * Change a booking's price (before HST), e.g. the car needed more oil or a different filter than quoted.
 * The difference shows as its own line ("Price changed by Mathew"), the profit moves by the same amount, and the job
 * sheet and receipt start from the new price.
 */
export async function setPrice(id: string, subtotalIn: number, by: string, tell = false) {
  const subtotal = Math.round(Number(subtotalIn) * 100) / 100;
  if (!(subtotal >= 0 && subtotal < 20000)) return { ok: false as const, error: "Check the price" };
  const [b] = await sbGet<{ status: string; quote_breakdown: (Priced & { cost?: number | null; raised?: boolean; needsReview?: string[] }) | null }>(
    `bookings?select=status,quote_breakdown&id=eq.${enc(id)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  if (b.status === "done" || b.status === "cancelled") return { ok: false as const, error: "This job is already finished or cancelled" };
  const rate = Number((await rules()).hst_rate ?? 0.14);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const who = by ? by.charAt(0).toUpperCase() + by.slice(1) : "HQ";
  const q = b.quote_breakdown;
  // earlier price changes are folded into the new one, so there's only ever one line for it
  const lines = (q?.lines ?? []).filter((l) => !/^Price (changed|set) by /.test(l.label));
  const base = r2(lines.reduce((t, l) => t + Number(l.amount), 0));
  const diff = r2(subtotal - base);
  const newLines = lines.length ? [...lines, ...(diff ? [{ label: `Price changed by ${who}`, amount: diff }] : [])] : [{ label: `Price set by ${who}`, amount: subtotal }];
  const hst = r2(subtotal * rate);
  const oldProfit = q?.profit ?? null;
  const oldDiff = r2((q?.lines ?? []).filter((l) => /^Price (changed|set) by /.test(l.label)).reduce((t, l) => t + Number(l.amount), 0));
  const profit = oldProfit == null ? null : r2(oldProfit - oldDiff + diff);
  const breakdown = { ...(q ?? {}), lines: newLines, subtotal, hst, total: r2(subtotal + hst), profit };
  const ok = await sbPatch("bookings", `id=eq.${enc(id)}`, { quoted_total: breakdown.total, quote_breakdown: breakdown });
  if (!ok) return { ok: false as const, error: "Couldn't save the price" };
  const oldTotal = q?.total ?? null;
  const told = tell && oldTotal !== breakdown.total ? await tellNewPrice(id, breakdown.total, oldTotal).catch(() => ({ sent: false, status: "error" })) : null;
  return { ok: true as const, total: breakdown.total, profit, told };
}

const FAMILY_TEXT = "Hi {first_name}, we've put your appointment {when} on our family price. Your new total is {total}{was}. See you then!\n- {signer}, Oil Change On The Spot";
const ADDED_TEXT = "Hi {first_name}, quick update on your appointment {when}: we added {change} like you asked. Your new total is {total} with HST{was}. If you have any questions, just reply here.\n- {signer}, Oil Change On The Spot";
const REMOVED_TEXT = "Hi {first_name}, quick update on your appointment {when}: we took off {change} like you asked. Your new total is {total} with HST{was}. If you have any questions, just reply here.\n- {signer}, Oil Change On The Spot";
const PRICE_TEXT = "Hi {first_name}, quick update on your appointment {when}: the new total is {total} with HST{was}. If you have any questions, just reply here.\n- {signer}, Oil Change On The Spot";

/** Text the customer their new price (owners tick "Text them the new price"). Fleets get it on their invoice, not by text. */
export async function tellNewPrice(id: string, total: number, oldTotal: number | null, change?: string, family?: "on" | "off", added?: string) {
  const [b] = await sbGet<{ starts_at: string; fleet_account_id: string | null; customers: { id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null } | null }>(
    `bookings?select=starts_at,fleet_account_id,customers(id,first_name,phone,sms_opt_out)&id=eq.${enc(id)}`);
  const c = b?.customers;
  if (!b || b.fleet_account_id || !c?.phone) return { sent: false, status: "no_phone" };
  if (c.sms_opt_out) return { sent: false, status: "opted_out" };
  const [t] = await sbGet<{ body: string; active: boolean }>("message_templates?select=body,active&key=eq.price_changed").catch(() => []);
  if (t && !t.active) return { sent: false, status: "template_off" };
  const { fill, sendSms } = await import("@/lib/os/sms");
  const { signed } = await import("@/lib/os/signer");
  const m = (n: number) => `$${n.toFixed(2)}`;
  // something was taken off: say what, then the new total
  const body = family === "on" ? FAMILY_TEXT : added ? ADDED_TEXT : change ? REMOVED_TEXT : t?.body || PRICE_TEXT;
  const text = await signed(fill(body, { change: change ?? added ?? "", first_name: c.first_name?.trim() || "there", when: when(b.starts_at), total: m(total), old_total: oldTotal != null ? m(oldTotal) : "", was: oldTotal != null ? ` (it was ${m(oldTotal)})` : "" }));
  const { isFamily, noHstWords } = await import("@/lib/os/customer-texts");
  const r = await sendSms(c.phone, (await isFamily(id)) ? noHstWords(text) : text, { kind: "price_changed", customerId: c.id, bookingId: id });
  return { sent: r.status === "sent" || r.status === "queued" || r.status === "delivered", status: r.status };
}

export type BookingEdit = { firstName?: string; lastName?: string; phone?: string; email?: string; address?: string; notes?: string;
  car?: { year?: unknown; make?: unknown; model?: unknown; engine?: unknown }; oil?: { grade?: string; litres?: string | number; filter?: string };
  parts?: { cabin?: string; air?: string; wiperDriver?: string; wiperPassenger?: string };
  removeLines?: number[]; addAddons?: string[]; tell?: boolean };   // price lines they don't want any more (a cabin filter they changed their mind on)

/** Everything the edit screen shows for one booking. */
export async function bookingForEdit(id: string) {
  const [b] = await sbGet<{ id: string; address: string | null; notes: string | null; vehicle_id: string | null; fleet_account_id: string | null;
    customers: { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | null;
    services: { job?: string; addons?: string[] } | null; cars: number | null; quote_breakdown: { lines?: { label: string; amount: number }[] } | null;
    vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null;
      vehicle_specs: { oil_grade: string | null; capacity_l: number | null; oil_filter_part: string | null; cabin_filter_part: string | null; air_filter_part: string | null; wiper_driver: string | null; wiper_passenger: string | null } | null } | null }>(
    `bookings?select=id,address,notes,vehicle_id,fleet_account_id,services,cars,quote_breakdown,customers(id,first_name,last_name,phone,email),vehicles(year,make,model,engine,vehicle_specs(oil_grade,capacity_l,oil_filter_part,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger))&id=eq.${enc(id)}`);
  if (!b) return null;
  const c = b.customers, v = b.vehicles, sp = v?.vehicle_specs;
  const { stockFor } = await import("@/lib/os/spec-learn");
  const job = b.services?.job;
  // the add-ons they picked that take a part we can note (battery and top-ups don't)
  const addons = (b.services?.addons ?? []).filter((a) => a === "cabin_filter" || a === "engine_filter" || a === "wipers");
  const parts = { cabin: sp?.cabin_filter_part ?? "", air: sp?.air_filter_part ?? "", wiperDriver: sp?.wiper_driver ?? "", wiperPassenger: sp?.wiper_passenger ?? "" };
  return { withOil: !job || job === "oil_change" || job === "seasonal", cars: b.cars || 1, addons, parts, lines: b.quote_breakdown?.lines ?? [], allAddons: b.services?.addons ?? [],
    oil: { grade: sp?.oil_grade ?? "", litres: sp?.capacity_l != null ? String(Number(sp.capacity_l)) : "", filter: sp?.oil_filter_part ?? "" },
    stock: await stockFor(sp?.oil_filter_part ?? null, sp?.oil_grade ?? null), firstName: c?.first_name ?? "", lastName: c?.last_name ?? "", phone: (c?.phone ?? "").replace(/^\+1/, ""), email: c?.email ?? "",
    address: b.address ?? "", notes: b.notes ?? "", hasCustomer: !!c, fleet: !!b.fleet_account_id,
    car: { year: v?.year ? String(v.year) : "", make: v?.make ?? "", model: v?.model ?? "", engine: v?.engine ?? "" } };
}

/**
 * Owners fix a booking's details: the customer's name, phone and email, where to go, the car, and the note.
 * Name/phone/email are the customer's own (so they're right everywhere). A car with finished jobs on it that's
 * changed to a different make/model becomes a new car on their file, so the old car's history stays true.
 */
/** Add services to a booking (a cabin filter they asked for on the phone): priced for their car like the website would,
 *  added to the bill and to the job so the Bring list and Stock know. */
async function addAddons(id: string, kinds: string[], by: string) {
  type L = { label: string; amount: number };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const OK = ["tires", "wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid"];
  const [b] = await sbGet<{ status: string; starts_at: string; cars: number | null; services: { job?: string; addons?: string[]; own?: string | null } & Record<string, unknown> | null;
    quote_breakdown: Record<string, unknown> & { lines?: L[]; subtotal?: number; hst?: number; total?: number } | null;
    vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null } | null }>(
    `bookings?select=status,starts_at,cars,services,quote_breakdown,vehicles(year,make,model,engine)&id=eq.${enc(id)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  if (b.status === "done") return { ok: false as const, error: "This job is already finished. Add it on the job sheet instead" };
  const have = b.services?.addons ?? [];
  const add = Array.from(new Set(kinds.filter((k) => OK.includes(k) && !have.includes(k))));
  if (!add.length) return { ok: false as const, error: "They already have that" };
  const v = b.vehicles;
  if (!v?.year || !v.make || !v.model) return { ok: false as const, error: "Add the car first (year, make, model), so the price is right" };
  const { buildQuote } = await import("@/lib/os/quote-service");
  const day = new Date(b.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
  const base = { year: v.year, make: v.make, model: v.model, engine: v.engine, job: (b.services?.job ?? "oil_change") as never, own: (b.services?.own ?? null) as never, cars: b.cars || 1, date: day };
  // the price of just the new services: the quote with them, less the quote without
  const [without, withNew] = await Promise.all([buildQuote({ ...base, addons: have as never }).then((x) => x.quote), buildQuote({ ...base, addons: [...have, ...add] as never }).then((x) => x.quote)]);
  const seen = new Set(without.lines.map((l: L) => l.label));
  let newLines: L[] = withNew.lines.filter((l: L) => !seen.has(l.label));
  if (!newLines.length) {   // labels collided: fall back to the difference in price
    const diff = r2(withNew.subtotal - without.subtotal);
    if (diff <= 0) return { ok: false as const, error: "Couldn't price that for this car" };
    newLines = [{ label: add.join(", "), amount: diff }];
  }
  const q = b.quote_breakdown ?? {};
  const lines = [...(q.lines ?? []), ...newLines.map((l) => ({ label: l.label, amount: r2(Number(l.amount)) }))];
  const rate = Number(q.hst ?? 0) > 0 && Number(q.subtotal ?? 0) > 0 ? r2(Number(q.hst) / Number(q.subtotal)) : 0.14;
  const subtotal = r2(lines.reduce((t, l) => t + Number(l.amount), 0));
  const bd = { ...q, lines, subtotal, hst: r2(subtotal * rate), total: r2(subtotal * (1 + rate)),
    added: [...((q.added as unknown[]) ?? []), ...newLines.map((l) => ({ ...l, by, at: new Date().toISOString() }))] };
  const services = { ...(b.services ?? {}), addons: [...have, ...add] };
  const ok = await sbPatch("bookings", `id=eq.${enc(id)}`, { quote_breakdown: bd, quoted_total: bd.total, services });
  return ok ? { ok: true as const, total: bd.total as number, oldTotal: q.total != null ? Number(q.total) : null, added: andList(newLines.map((l) => `the ${l.label.replace(/^(.)/, (c) => c.toLowerCase())}`)) }
    : { ok: false as const, error: "Couldn't save the price" };
}

const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Take lines off a booking's price (an add-on they don't want any more) and drop that add-on from the job. */
async function removeLines(id: string, idx: number[], by: string) {
  type L = { label: string; amount: number };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const [b] = await sbGet<{ status: string; services: { addons?: string[] } & Record<string, unknown> | null; quote_breakdown: Record<string, unknown> & { lines?: L[]; family?: L[] } | null }>(
    `bookings?select=status,services,quote_breakdown&id=eq.${enc(id)}`);
  if (!b?.quote_breakdown?.lines?.length) return { ok: false as const, error: "No price on this booking" };
  if (b.status === "done") return { ok: false as const, error: "This job is already finished" };
  const q = b.quote_breakdown, lines = q.lines!;
  const drop = new Set(idx.filter((i) => Number.isInteger(i) && i >= 0 && i < lines.length));
  if (drop.size >= lines.length) return { ok: false as const, error: "Can't take everything off. Use Move or cancel instead" };
  const { ADDON_NAMES } = await import("@/lib/os/addon-needs");
  const kindOf = (l: L) => Object.keys(ADDON_NAMES).find((k) => ADDON_NAMES[k].test(l.label)) ?? null;
  const gone = lines.filter((_, i) => drop.has(i));
  const goneKinds = new Set(gone.map(kindOf).filter(Boolean) as string[]);
  const kept = lines.filter((_, i) => !drop.has(i));
  const rate = Number(q.hst ?? 0) > 0 && Number(q.subtotal ?? 0) > 0 ? Math.round((Number(q.hst) / Number(q.subtotal)) * 100) / 100 : 0.14;
  const subtotal = r2(kept.reduce((t, l) => t + Number(l.amount), 0));
  const bd: Record<string, unknown> = { ...q, lines: kept, subtotal, hst: r2(subtotal * rate), total: r2(subtotal * (1 + rate)),
    removed: [...((q.removed as unknown[]) ?? []), ...gone.map((l) => ({ ...l, by, at: new Date().toISOString() }))] };
  // family price keeps the regular lines for "back to regular": take the same add-on off those too
  if (q.family && goneKinds.size) bd.family = q.family.filter((l) => { const k = kindOf(l); return !k || !goneKinds.has(k); });
  const services = { ...(b.services ?? {}), addons: (b.services?.addons ?? []).filter((a) => !goneKinds.has(a)) };
  const ok = await sbPatch("bookings", `id=eq.${enc(id)}`, { quote_breakdown: bd, quoted_total: bd.total, services });
  return ok ? { ok: true as const, total: bd.total as number, removed: andList(gone.map((l) => `the ${l.label.replace(/^(.)/, (c) => c.toLowerCase())}`)), oldTotal: q.total != null ? Number(q.total) : null } : { ok: false as const, error: "Couldn't save the price" };
}

export async function editBooking(id: string, e: BookingEdit, by: string) {
  const [b] = await sbGet<{ id: string; status: string; customer_id: string | null; vehicle_id: string | null; address: string | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `bookings?select=id,status,customer_id,vehicle_id,address,vehicles(year,make,model)&id=eq.${enc(id)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  if (b.customer_id && [e.firstName, e.lastName, e.phone, e.email].some((x) => x !== undefined)) {
    const { updateCustomer } = await import("@/lib/os/customers");
    const r = await updateCustomer(b.customer_id, { firstName: e.firstName, lastName: e.lastName, phone: e.phone, email: e.email }, by);
    if (!r.ok) return r;
  }
  const patch: Record<string, unknown> = {};
  if (Array.isArray(e.addAddons) && e.addAddons.length) {
    const r = await addAddons(id, e.addAddons, by);
    if (!r.ok) return r;
    if (e.tell && r.total !== r.oldTotal && !(Array.isArray(e.removeLines) && e.removeLines.length)) await tellNewPrice(id, r.total, r.oldTotal, undefined, undefined, r.added).catch(() => null);
  }
  if (Array.isArray(e.removeLines) && e.removeLines.length) {
    const r = await removeLines(id, e.removeLines, by);
    if (!r.ok) return r;
    if (e.tell && r.total !== r.oldTotal) await tellNewPrice(id, r.total, r.oldTotal, r.removed).catch(() => null);
  }
  if (e.address !== undefined) {
    const a = e.address.trim().slice(0, 200);
    if (!a) return { ok: false as const, error: "Add the address we're going to" };
    patch.address = a;
  }
  if (e.notes !== undefined) patch.notes = e.notes.trim().slice(0, 1000) || null;
  if (e.car && b.customer_id) {
    const t = (x: unknown) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x));
    const year = t(e.car.year), make = t(e.car.make), model = t(e.car.model), engine = t(e.car.engine);
    if (year && !(Number(year) >= 1980 && Number(year) <= new Date().getFullYear() + 2)) return { ok: false as const, error: "Check the car's year" };
    const now = b.vehicles, low = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const differentCar = !!now && (low(now.make) !== low(make) || low(now.model) !== low(model));
    const [history] = b.vehicle_id && differentCar ? await sbGet<{ id: string }>(`jobs?select=id&vehicle_id=eq.${enc(b.vehicle_id)}&limit=1`).catch(() => []) : [];
    if (b.vehicle_id && !history) {
      const { updateCar } = await import("@/lib/os/customers");
      const r = await updateCar(b.customer_id, b.vehicle_id, { year: year || undefined, make, model, engine });
      if (!r.ok) return r;
    } else if (make || model) {
      const r = await sbInsert<{ id: string }>("vehicles", { customer_id: b.customer_id, year: year ? Math.round(Number(year)) : null, make: make || null, model: model || null, engine: engine || null });
      if (!r.ok || !r.data) return { ok: false as const, error: "Couldn't save the car" };
      const { updateCar } = await import("@/lib/os/customers");
      await updateCar(b.customer_id, r.data.id, { year: year || undefined, make, model, engine }).catch(() => null);   // links the oil/filter spec
      patch.vehicle_id = r.data.id;
    }
  }
  if (Object.keys(patch).length && !(await sbPatch("bookings", `id=eq.${enc(id)}`, patch))) return { ok: false as const, error: "Couldn't save" };
  if (e.oil) {
    const carId = (patch.vehicle_id as string | undefined) ?? b.vehicle_id;
    if (!carId) return { ok: false as const, error: "Add the car first, then the oil" };
    const { setCarOil } = await import("@/lib/os/spec-learn");
    const r = await setCarOil(carId, e.oil);
    if (!r.ok) return r;
    // the "oil not found online" note on the card is answered now
    const [nb] = await sbGet<{ needs_review: string[] | null }>(`bookings?select=needs_review&id=eq.${enc(id)}`).catch(() => []);
    if (nb?.needs_review?.length) await sbPatch("bookings", `id=eq.${enc(id)}`, { needs_review: nb.needs_review.filter((n) => !/^(Oil spec not found online|Oil from our )/.test(n)) }).catch(() => null);
  }
  if (e.parts && typeof e.parts === "object") {   // part numbers for the add-ons (cabin, air filter, wiper sizes)
    const carId = (patch.vehicle_id as string | undefined) ?? b.vehicle_id;
    if (!carId) return { ok: false as const, error: "Add the car first, then the parts" };
    const keep = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, 40) : undefined);
    const pp = { cabin: keep(e.parts.cabin), air: keep(e.parts.air), wiperDriver: keep(e.parts.wiperDriver), wiperPassenger: keep(e.parts.wiperPassenger) };
    const only = Object.fromEntries(Object.entries(pp).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v || null]));
    if (Object.keys(only).length) {
      const { setCarOil } = await import("@/lib/os/spec-learn");
      const r = await setCarOil(carId, only);
      if (!r.ok) return r;
    }
  }
  return { ok: true as const };
}

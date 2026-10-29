// Grouping each day's jobs by area (free: OpenStreetMap for map points, Google Maps links for directions).
//  - Two evenings before a day, we look at its jobs. A job that sends us across town and back gets a text offering
//    an open time next to the jobs near it. YES moves it, NO (or no answer) keeps their time.
//  - HQ shows the day's stops in order with one link that opens the whole route in Google Maps.
import { sbGet, sbInsert, sbPatch, sbRpc, enc } from "@/lib/os/db";
import { dayAvailability } from "@/lib/os/calendar";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { bases } from "@/lib/os/maps";
import { planOffers, planSwaps, replyIs, routeLink, type Stop } from "@/lib/os/route-plan";
import crypto from "crypto";
import { sendSms, template, fill } from "@/lib/os/sms";
import { timeOnly, when } from "@/lib/os/customer-texts";
import { bookingById, moveBooking } from "@/lib/os/manage";
import { pushToOwners } from "@/lib/os/push";
import { geocode } from "@/lib/os/geo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DayRow = { id: string; starts_at: string; ends_at: string; address: string | null; status: string; pay_mode: string; group_id: string | null;
  customers: { id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null; address: string | null } | null };
const minutes = (iso: string, date: string) => Math.round((new Date(iso).getTime() - halifaxToDate(date, 0).getTime()) / 60000);

async function dayRows(date: string) {
  const from = halifaxToDate(date, 0).toISOString(), to = halifaxToDate(date, 24 * 60).toISOString();
  return sbGet<DayRow>(`bookings?select=id,starts_at,ends_at,address,status,pay_mode,group_id,customers(id,first_name,phone,sms_opt_out,address)` +
    `&starts_at=gte.${from}&starts_at=lt.${to}&status=in.(requested,confirmed,in_progress)&order=starts_at`);
}

/** The day's stops in time order with a Google Maps link through all of them (for the calendar). */
export async function dayRoute(date: string) {
  const rows = await dayRows(date).catch(() => [] as DayRow[]);
  const addrs: string[] = [];
  for (const r of rows) { const a = r.address || r.customers?.address; if (a && addrs[addrs.length - 1] !== a) addrs.push(a); }   // a multi-car visit is one stop
  const home = (await bases())[0];
  const offers = rows.length ? await sbGet<{ booking_id: string; to_start: string; status: string }>(
    `route_offers?select=booking_id,to_start,status&booking_id=in.(${rows.map((r) => r.id).join(",")})&order=created_at.desc`).catch(() => []) : [];
  return { link: routeLink(home, addrs), stops: addrs.length, offers };
}

/** Two evenings before: offer better times to the jobs that zig-zag across town. Returns how many texts went out. */
export async function offerRouteMoves(date: string) {
  const [rule] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.route_offers_per_day").catch(() => []);
  const max = rule ? Number(rule.value) : 3;
  if (!(max > 0)) return { offered: 0, note: "turned off" };
  const rows = await dayRows(date);
  if (rows.length < 3) return { offered: 0, note: "fewer than 3 jobs" };
  const already = await sbGet<{ booking_id: string }>(`route_offers?select=booking_id&booking_id=in.(${rows.map((r) => r.id).join(",")})`).catch(() => null);
  if (already === null) return { offered: 0, note: "run migration 0034" };
  const home = await geocode((await bases())[0]);
  if (!home) return { offered: 0, note: "couldn't find our start point on the map" };
  const groups = new Map<string, number>();
  for (const r of rows) if (r.group_id) groups.set(r.group_id, (groups.get(r.group_id) ?? 0) + 1);
  // one stop per visit: the cars of a multi-car visit sit together and never move
  const stops: Stop[] = []; const byId = new Map<string, DayRow>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.group_id && seen.has(r.group_id)) continue;
    if (r.group_id) seen.add(r.group_id);
    const pt = await geocode(r.address || r.customers?.address);
    if (!pt) continue;
    const end = r.group_id ? Math.max(...rows.filter((x) => x.group_id === r.group_id).map((x) => minutes(x.ends_at, date))) : minutes(r.ends_at, date);
    const movable = !r.group_id && r.status === "confirmed" && r.pay_mode !== "fleet_invoice" && !!r.customers?.phone && !r.customers.sms_opt_out
      && !already.some((a) => a.booking_id === r.id);
    stops.push({ id: r.id, ...pt, start: minutes(r.starts_at, date), end, movable });
    byId.set(r.id, r);
  }
  // the open times each movable job could go to (free of other jobs, holds and blocked time)
  const open = new Map<string, number[]>();
  for (const s of stops.filter((x) => x.movable)) {
    const day = await dayAvailability(date, { cars: 1, minutes: s.end - s.start, filterInStock: true, ignoreBookingId: s.id }).catch(() => null);
    open.set(s.id, (day?.slots ?? []).map((x) => minutes(x.start, date)));
  }
  // 1) trades: two customers swap times (works on a full day); 2) moves into an open time near the others
  const swaps = max >= 2 ? planSwaps(stops, home, { max: Math.floor(max / 2) }) : [];
  const traded = new Set(swaps.flatMap((w) => [w.a, w.b]));
  const offers = planOffers(stops.map((x) => (traded.has(x.id) ? { ...x, movable: false } : x)), (id) => open.get(id) ?? [], home, { max: max - swaps.length * 2 });
  let sent = 0;
  const body = (await template("route_offer")) || "Hi {first_name}, it's Mathew from Oil Change On The Spot. To keep our route tight on {day}, could we move your appointment from {old_time} to {new_time}? Reply YES to move it or NO to keep {old_time}. Either is totally fine!";
  const ask = async (r: DayRow, toIso: string, row: Record<string, unknown>) => {
    const ins = await sbInsert<{ id: string }>("route_offers", { booking_id: r.id, from_start: r.starts_at, to_start: toIso, status: "sent", ...row });
    if (!ins.ok) return false;
    const day = new Date(toIso).toLocaleDateString("en-CA", { timeZone: "America/Halifax", weekday: "long" });
    const x = await sendSms(r.customers!.phone!, fill(body, { first_name: r.customers?.first_name?.trim() || "there", day, new_time: timeOnly(toIso), old_time: timeOnly(r.starts_at) }),
      { kind: "route_offer", customerId: r.customers?.id ?? null, bookingId: r.id });
    if (!x.sent) await sbPatch("route_offers", `id=eq.${ins.data!.id}`, { status: "not_sent" }).catch(() => null);
    return x.sent;
  };
  // a trade has to be settled by noon the day before, so both know their time before the reminder goes out
  const noonBefore = halifaxToDate(addDays(date, -1), 12 * 60).toISOString();
  for (const w of swaps) {
    const a = byId.get(w.a)!, b = byId.get(w.b)!;
    const pair = crypto.randomUUID();
    const okA = await ask(a, b.starts_at, { pair_id: pair, saved_km: w.savedKm, expires_at: noonBefore });
    const okB = await ask(b, a.starts_at, { pair_id: pair, saved_km: w.savedKm, expires_at: noonBefore });
    sent += Number(okA) + Number(okB);
    if (!okA || !okB) await sbPatch("route_offers", `pair_id=eq.${pair}&status=eq.sent`, { status: "withdrawn" }).catch(() => null);   // one text failed: the other just keeps their time
  }
  for (const o of offers) {
    const r = byId.get(o.id)!;
    if (await ask(r, halifaxToDate(date, o.to).toISOString(), { saved_km: o.savedKm, expires_at: new Date(new Date(r.starts_at).getTime() - 3 * 3600000).toISOString() })) sent++;
  }
  return { offered: sent, trades: swaps.length, moves: offers.length };
}

const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
type Offer = { id: string; booking_id: string; from_start: string; to_start: string; status: string; pair_id: string | null;
  bookings: { customer_id: string; status: string; customers: { id: string; first_name: string | null; phone: string | null } | null } | null };
const OFFER = "id,booking_id,from_start,to_start,status,pair_id,bookings!inner(customer_id,status,customers(id,first_name,phone))";
const say = (o: Offer, text: string) => o.bookings?.customers?.phone
  ? sendSms(o.bookings.customers.phone, text, { kind: "route_reply", customerId: o.bookings.customers.id, bookingId: o.booking_id }).catch(() => null) : Promise.resolve(null);
const keep = (o: Offer, why: string) => say(o, `${why} you keep ${timeOnly(o.from_start)}. See you then! - Mathew`);

/** A text came in: is it a YES or NO to one of our offers? Returns true when handled (so it doesn't also land in HQ as a new text). */
export async function handleRouteReply(phone: string, text: string): Promise<boolean> {
  const answer = replyIs(text);
  if (!answer) return false;
  const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`).catch(() => []);
  if (!c) return false;
  const [o] = await sbGet<Offer>(`route_offers?select=${OFFER}&bookings.customer_id=eq.${c.id}&status=in.(sent,yes_waiting,withdrawn)&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`).catch(() => []);
  if (!o || !["confirmed", "requested"].includes(o.bookings?.status ?? "")) return false;
  const now = new Date().toISOString();
  // the trade fell through before they answered
  if (o.status === "withdrawn") { await sbPatch("route_offers", `id=eq.${o.id}`, { status: "expired", answered_at: now }); await keep(o, "Thanks for getting back to us! Plans changed, so"); return true; }
  if (o.status === "yes_waiting") return false;   // already said yes: anything else they text goes to HQ

  if (o.pair_id) {
    const [other] = await sbGet<Offer>(`route_offers?select=${OFFER}&pair_id=eq.${o.pair_id}&id=neq.${o.id}`).catch(() => []);
    if (answer === "no") {
      await sbPatch("route_offers", `id=eq.${o.id}`, { status: "declined", answered_at: now });
      await say(o, `No problem at all, we'll see you at ${timeOnly(o.from_start)} as planned. - Mathew`);
      if (other?.status === "yes_waiting") { await sbPatch("route_offers", `id=eq.${other.id}`, { status: "expired", answered_at: now }); await keep(other, "Thanks for saying yes! The switch didn't work out on the other end, so"); }
      else if (other?.status === "sent") await sbPatch("route_offers", `id=eq.${other.id}`, { status: "withdrawn" });
      return true;
    }
    if (other?.status !== "yes_waiting") {
      if (other?.status === "sent") {
        await sbPatch("route_offers", `id=eq.${o.id}`, { status: "yes_waiting", answered_at: now });
        await say(o, `Thanks! We're just confirming with one other customer and we'll text you back. Until then you're still booked for ${timeOnly(o.from_start)}. - Mathew`);
      } else { await sbPatch("route_offers", `id=eq.${o.id}`, { status: "expired", answered_at: now }); await keep(o, "Thanks! Plans changed, so"); }
      return true;
    }
    // both said yes: trade the two times in one go
    const ok = await sbRpc<boolean>("swap_booking_times", { a: o.booking_id, b: other.booking_id }).catch(() => false);
    for (const x of [o, other]) await sbPatch("route_offers", `id=eq.${x.id}`, { status: ok ? "accepted" : "taken", answered_at: now });
    if (!ok) { await keep(o, "Thanks! Something changed on our side, so"); await keep(other, "Thanks for saying yes! Something changed on our side, so"); return true; }
    for (const x of [o, other]) await say(x, `You're all set: your appointment is now ${when(x.to_start)}. Thanks for helping us out! - Mathew`);
    const date = halifaxDate(new Date(o.to_start));
    await Promise.race([pushToOwners({ title: `Route: ${o.bookings?.customers?.first_name || "A customer"} and ${other.bookings?.customers?.first_name || "a customer"} switched times`, body: "Both said yes, so the day is grouped by area.", url: `/owner?date=${date}`, tag: `route-${o.pair_id}` }).catch(() => null), sleep(3000)]);
    return true;
  }

  if (answer === "no") {
    await sbPatch("route_offers", `id=eq.${o.id}`, { status: "declined", answered_at: now });
    await say(o, `No problem at all, we'll see you at ${timeOnly(o.from_start)} as planned. - Mathew`);
    return true;
  }
  // YES to an open time: only if it's still open
  const b = await bookingById(o.booking_id);
  const date = halifaxDate(new Date(o.to_start));
  const len = b ? (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000 : 75;
  const day = await dayAvailability(date, { cars: 1, minutes: len, filterInStock: true, ignoreBookingId: o.booking_id }).catch(() => null);
  const free = day?.slots.some((x) => new Date(x.start).getTime() === new Date(o.to_start).getTime());
  const r = b && free ? await moveBooking(b, o.to_start, "route") : { ok: false };   // a move texts them the new time
  await sbPatch("route_offers", `id=eq.${o.id}`, { status: r.ok ? "accepted" : "taken", answered_at: now });
  if (r.ok) await Promise.race([pushToOwners({ title: `Route: ${b?.customers?.first_name || "A customer"} moved to ${when(o.to_start)}`, body: "They said yes to the closer time.", url: `/owner?date=${date}`, tag: `route-${o.id}` }).catch(() => null), sleep(3000)]);
  else await keep(o, "Thanks! That time just got booked, so");
  return true;
}

/** Daily: trades nobody finished answering by noon the day before. Whoever said yes is told they keep their time. */
export async function closeRouteOffers() {
  const now = new Date().toISOString();
  const late = await sbGet<Offer>(`route_offers?select=${OFFER}&status=in.(sent,yes_waiting,withdrawn)&expires_at=lt.${now}&limit=50`).catch(() => []);
  for (const o of late) {
    await sbPatch("route_offers", `id=eq.${o.id}`, { status: "expired" });
    if (o.status === "yes_waiting") await keep(o, "Thanks for saying yes! We didn't hear back from the other customer in time, so");
  }
  return late.length;
}

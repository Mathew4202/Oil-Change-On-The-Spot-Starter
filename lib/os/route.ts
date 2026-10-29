// Grouping each day's jobs by area (free: OpenStreetMap for map points, Google Maps links for directions).
//  - Two evenings before a day, we look at its jobs. A job that sends us across town and back gets a text offering
//    an open time next to the jobs near it. YES moves it, NO (or no answer) keeps their time.
//  - HQ shows the day's stops in order with one link that opens the whole route in Google Maps.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { dayAvailability } from "@/lib/os/calendar";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { bases } from "@/lib/os/maps";
import { planOffers, replyIs, routeLink, type Stop } from "@/lib/os/route-plan";
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
  const offers = planOffers(stops, (id) => open.get(id) ?? [], home, { max });
  let sent = 0;
  const body = (await template("route_offer")) || "Hi {first_name}, it's Mathew from Oil Change On The Spot. To keep our route tight on {day}, could we move your appointment from {old_time} to {new_time}? Reply YES to move it or NO to keep {old_time}. Either is totally fine!";
  for (const o of offers) {
    const r = byId.get(o.id)!;
    const toIso = halifaxToDate(date, o.to).toISOString();
    const ins = await sbInsert("route_offers", { booking_id: r.id, from_start: r.starts_at, to_start: toIso, saved_km: o.savedKm, status: "sent",
      expires_at: new Date(new Date(r.starts_at).getTime() - 3 * 3600000).toISOString() });
    if (!ins.ok) continue;
    const day = new Date(toIso).toLocaleDateString("en-CA", { timeZone: "America/Halifax", weekday: "long" });
    const x = await sendSms(r.customers!.phone!, fill(body, { first_name: r.customers?.first_name?.trim() || "there", day, new_time: timeOnly(toIso), old_time: timeOnly(r.starts_at) }),
      { kind: "route_offer", customerId: r.customers?.id ?? null, bookingId: r.id });
    if (x.sent) sent++;
    else await sbPatch("route_offers", `booking_id=eq.${r.id}&status=eq.sent`, { status: "not_sent" }).catch(() => null);
  }
  return { offered: sent, planned: offers.length };
}

/** A text came in: is it a YES or NO to one of our offers? Returns true when handled (so it doesn't also land in HQ as a new text). */
export async function handleRouteReply(phone: string, text: string): Promise<boolean> {
  const answer = replyIs(text);
  if (!answer) return false;
  const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`).catch(() => []);
  if (!c) return false;
  const [o] = await sbGet<{ id: string; booking_id: string; from_start: string; to_start: string; bookings: { customer_id: string; status: string } | null }>(
    `route_offers?select=id,booking_id,from_start,to_start,bookings!inner(customer_id,status)&bookings.customer_id=eq.${c.id}&status=eq.sent&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`).catch(() => []);
  if (!o || !["confirmed", "requested"].includes(o.bookings?.status ?? "")) return false;
  if (answer === "no") {
    await sbPatch("route_offers", `id=eq.${o.id}`, { status: "declined", answered_at: new Date().toISOString() });
    await sendSms(phone, `No problem at all, we'll see you at ${timeOnly(o.from_start)} as planned. - Mathew`, { kind: "route_reply", customerId: c.id, bookingId: o.booking_id });
    return true;
  }
  // YES: only if that time is still open
  const b = await bookingById(o.booking_id);
  const date = halifaxDate(new Date(o.to_start));
  const len = b ? (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000 : 75;
  const day = await dayAvailability(date, { cars: 1, minutes: len, filterInStock: true, ignoreBookingId: o.booking_id }).catch(() => null);
  const free = day?.slots.some((s) => new Date(s.start).getTime() === new Date(o.to_start).getTime());
  if (!b || !free) {
    await sbPatch("route_offers", `id=eq.${o.id}`, { status: "taken", answered_at: new Date().toISOString() });
    await sendSms(phone, `Thanks! That time just got booked, so you keep ${timeOnly(o.from_start)}. See you then. - Mathew`, { kind: "route_reply", customerId: c.id, bookingId: o.booking_id });
    return true;
  }
  const r = await moveBooking(b, o.to_start, "route");   // texts them the new time like any move
  await sbPatch("route_offers", `id=eq.${o.id}`, { status: r.ok ? "accepted" : "taken", answered_at: new Date().toISOString() });
  if (r.ok) await Promise.race([pushToOwners({ title: `Route: ${b.customers?.first_name || "A customer"} moved to ${when(o.to_start)}`, body: "They said yes to the closer time.", url: `/owner?date=${date}`, tag: `route-${o.id}` }).catch(() => null), sleep(3000)]);
  else await sendSms(phone, `Thanks! That time just got booked, so you keep ${timeOnly(o.from_start)}. See you then. - Mathew`, { kind: "route_reply", customerId: c.id, bookingId: o.booking_id });
  return true;
}

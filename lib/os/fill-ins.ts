// Filling a slow day: when a day has open times, we text a few past customers who are coming due for an oil change
// and live near the jobs already booked that day ("We'll be near you Tuesday, 10:30 or 1:00 are open").
// They get a booking link with everything filled in; they just pick the time. Each customer gets this at most once
// every 45 days, never right after an "oil due" text, and never if they already have something booked.
import { sbGet } from "@/lib/os/db";
import { sendSms, template, fill } from "@/lib/os/sms";
import { dayAvailability } from "@/lib/os/calendar";
import { halifaxToDate } from "@/lib/os/slots";
import { cachedPoints, geoKey, geocode } from "@/lib/os/geo";
import type { Pt } from "@/lib/os/route-plan";
import { pickFillIns, pickTimes } from "@/lib/os/fill-ins-pick";
import { areaOf } from "@/lib/os/money-hour";
import { timeOnly, siteUrl } from "@/lib/os/customer-texts";

type JobRow = { customer_id: string | null; vehicle_id: string | null; done_at: string; next_due_date: string;
  customers: { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null; sms_opt_out: boolean | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null; fleet_account_id: string | null } | null };
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };

export async function fillSlowDay(date: string, today: string) {
  const [rule] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.fill_in_texts_per_day").catch(() => []);
  const max = rule ? Number(rule.value) : 3;
  if (!(max > 0)) return { texted: 0, note: "turned off" };
  const from = halifaxToDate(date, 0).toISOString(), to = halifaxToDate(date, 24 * 60).toISOString();
  const day = await sbGet<{ id: string; starts_at: string; address: string | null; customer_id: string | null; customers: { address: string | null } | null }>(
    `bookings?select=id,starts_at,address,customer_id,customers(address)&starts_at=gte.${from}&starts_at=lt.${to}&status=in.(requested,confirmed)`);
  if (!day.length) return { texted: 0, note: "no jobs that day (we only fill days we're already out)" };
  const avail = await dayAvailability(date, { cars: 1, minutes: 60, filterInStock: true }).catch(() => null);
  const ms = (iso: string) => new Date(iso).getTime();
  const open = (avail?.slots ?? []).map((s) => s.start);
  if (open.length < 2) return { texted: 0, note: "day is full enough" };

  // past customers coming due within a month either side of that day, not fleets
  const jobs = await sbGet<JobRow>(`jobs?select=customer_id,vehicle_id,done_at,next_due_date,customers(id,first_name,last_name,phone,email,address,sms_opt_out),vehicles(year,make,model,engine,fleet_account_id)` +
    `&next_due_date=gte.${addDays(today, -30)}&next_due_date=lte.${addDays(date, 30)}&customer_id=not.is.null&vehicle_id=not.is.null&order=done_at.desc&limit=300`);
  const latest = new Map<string, JobRow>();
  for (const j of jobs) if (j.customers?.phone && !j.customers.sms_opt_out && !j.vehicles?.fleet_account_id && !latest.has(j.vehicle_id!)) latest.set(j.vehicle_id!, j);
  if (!latest.size) return { texted: 0, note: "nobody coming due" };
  const vids = [...latest.keys()], cids = [...new Set([...latest.values()].map((j) => j.customer_id!))];
  const [newer, upcoming, recent] = await Promise.all([
    // a newer job on the car means it was done since
    sbGet<{ vehicle_id: string; done_at: string }>(`jobs?select=vehicle_id,done_at&vehicle_id=in.(${vids.join(",")})&order=done_at.desc`),
    sbGet<{ customer_id: string }>(`bookings?select=customer_id&customer_id=in.(${cids.join(",")})&status=in.(requested,confirmed,in_progress)&starts_at=gt.${new Date().toISOString()}`),
    sbGet<{ customer_id: string; kind: string; sent_at: string }>(`messages?select=customer_id,kind,sent_at&customer_id=in.(${cids.join(",")})&kind=in.(fill_in,oil_due)&sent_at=gt.${new Date(Date.now() - 45 * 86400000).toISOString()}`).catch(() => []),
  ]);
  const week = Date.now() - 7 * 86400000;
  const skip = new Set([...upcoming.map((b) => b.customer_id), ...day.map((b) => b.customer_id).filter(Boolean) as string[],
    ...recent.filter((m) => m.kind === "fill_in" || new Date(m.sent_at).getTime() > week).map((m) => m.customer_id)]);
  const pool = [...latest.values()].filter((j) => !skip.has(j.customer_id!) && !newer.some((n) => n.vehicle_id === j.vehicle_id && n.done_at > j.done_at));
  const byCustomer = new Map<string, JobRow>(); for (const j of pool) if (!byCustomer.has(j.customer_id!)) byCustomer.set(j.customer_id!, j);
  if (!byCustomer.size) return { texted: 0, note: "nobody to ask" };

  // map points: from the cache, plus a few new lookups (OpenStreetMap allows one a second)
  const addrs = [...day.map((b) => b.address || b.customers?.address), ...[...byCustomer.values()].map((j) => j.customers?.address)];
  const pts = await cachedPoints(addrs);
  let lookups = 0;
  for (const a of addrs) if (a && !pts.has(geoKey(a)) && lookups++ < 12) { const p = await geocode(a); if (p) pts.set(geoKey(a), p); }
  const pt = (a: string | null | undefined) => (a ? pts.get(geoKey(a)) ?? null : null);
  const booked = day.map((b) => pt(b.address || b.customers?.address)).filter(Boolean) as Pt[];
  const chosen = pickFillIns([...byCustomer.values()].map((j) => ({ customerId: j.customer_id!, pt: pt(j.customers?.address), due: j.next_due_date })), booked, { max });

  const times = pickTimes(open.map(ms), day.map((b) => ms(b.starts_at)), 3, 60 * 60000).map((t) => timeOnly(new Date(t).toISOString()));
  const list = times.length > 1 ? `${times.slice(0, -1).join(", ")} or ${times[times.length - 1]}` : times[0];
  const dayName = new Date(halifaxToDate(date, 12 * 60)).toLocaleDateString("en-CA", { timeZone: "America/Halifax", weekday: "long" });
  const body = (await template("fill_in")) || "Hi {first_name}, it's {signer} from Oil Change On The Spot. We'll be in {area} on {day} and your {car} is coming up for an oil change. We have {times} open. Book in a minute here, your details are filled in: {link}";
  let texted = 0;
  for (const id of chosen) {
    const j = byCustomer.get(id)!, c = j.customers!, v = j.vehicles;
    const q = new URLSearchParams({ date });
    if (v?.year && v.make) { q.set("year", String(v.year)); q.set("make", v.make); if (v.model) q.set("model", v.model); }
    if (v?.engine) q.set("engine", v.engine);
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim(); if (name) q.set("name", name);
    if (c.address) q.set("address", c.address); if (c.email) q.set("email", c.email);
    q.set("phone", c.phone!.replace(/^\+1/, ""));
    const area = areaOf(c.address);
    const r = await sendSms(c.phone!, fill(body, { first_name: c.first_name?.trim() || "there", area: /^(Other|No address)/.test(area) ? "your area" : area, day: dayName,
      car: [v?.make, v?.model].filter(Boolean).join(" ") || "car", times: list, link: `${siteUrl()}/booking?${q}` }), { kind: "fill_in", customerId: id });
    if (r.sent) texted++;
  }
  return { texted, asked: chosen.length, open: open.length };
}

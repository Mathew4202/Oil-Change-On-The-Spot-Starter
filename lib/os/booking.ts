// One place that creates bookings, used by the customer website and by owners booking by phone.
import crypto from "crypto";
import { vinOk, cleanVin } from "@/lib/os/vin";
import { holdByToken, holdIsLive, useHold } from "@/lib/os/holds";
import { planFor } from "@/lib/os/plans";
import { applyPlan } from "@/lib/os/plan-cover";
import { decodeVin } from "@/lib/os/vin-photo";
import { z } from "zod";
import { sbGet, sbInsert, sbPatch, sbHeaders, enc } from "@/lib/os/db";
import { buildQuote, filterInStock } from "@/lib/os/quote-service";
import { drivingDistance, mapsReady } from "@/lib/os/maps";
import { dayAvailability, jobMinutes as minutesFor, seasonWindows } from "@/lib/os/calendar";
import { seasonFor } from "@/lib/os/seasons";
import { pushToOwners } from "@/lib/os/push";
import { newManageToken, sendBookingConfirmation } from "@/lib/os/customer-texts";
import { halifaxDate, label } from "@/lib/os/slots";
import { addLines } from "@/lib/os/deals";
import { findReferrer, setReferredBy, takeCredits, markCreditsUsed } from "@/lib/os/referrals";

export const BookingBody = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(4).max(200),
  car: z.object({ year: z.number().int().min(1980).max(2030), make: z.string().trim().min(1), model: z.string().trim().min(1), engine: z.string().trim().optional() }),
  job: z.enum(["oil_change", "seasonal", "parts", "diagnostic", "tires", "rotation"]).optional().default("oil_change"),
  addons: z.array(z.enum(["wipers", "cabin_filter", "engine_filter", "battery", "tires", "coolant", "washer_fluid"])).optional().default([]),
  own: z.enum(["both", "oil", "filter"]).nullable().optional(),
  start: z.string().datetime(),
  cars: z.number().int().min(1).max(5).optional().default(1),
  payMode: z.enum(["online", "after"]).default("after"),
  notes: z.string().max(1000).optional(),
  km: z.number().min(0).max(300).optional(),
  placeId: z.string().max(300).optional(),    // picked from the address suggestions
  agreeTerms: z.boolean().optional(),          // website: cancellation (and diagnostic) terms ticked
  photos: z.array(z.string().regex(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/)).max(3).optional(),   // VIN / engine label photo (optional)
  vin: z.string().max(25).optional(),
  holdToken: z.string().max(40).optional(),    // booked from the link we texted while holding the time on a call
  refCode: z.string().max(20).optional(),      // came from a friend's referral link (/r/CODE)
  referredBy: z.string().max(80).optional(),   // or typed who sent them (name or phone)
  // more cars on the same visit (each gets its own booking, back to back, one travel fee)
  moreCars: z.array(z.object({
    car: z.object({ year: z.number().int().min(1980).max(2030), make: z.string().trim().min(1), model: z.string().trim().min(1), engine: z.string().trim().optional() }),
    job: z.enum(["oil_change", "seasonal", "parts", "diagnostic", "tires", "rotation"]).default("oil_change"),
    addons: z.array(z.enum(["wipers", "cabin_filter", "engine_filter", "battery", "tires", "coolant", "washer_fluid"])).default([]),
    own: z.enum(["both", "oil", "filter"]).nullable().optional(),
    notes: z.string().max(600).optional(),
    vin: z.string().max(25).optional(),        // snapped or typed for this car
  })).max(3).optional(),
});
export type BookingInput = z.infer<typeof BookingBody>;
export const needsSomething = (b: Pick<BookingInput, "job" | "addons">) => b.job !== "parts" || b.addons.length > 0;

export function e164(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

const halifaxMinutes = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Halifax", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).split(":").map(Number);
  return (h % 24) * 60 + m;
};

export type BookingResult =
  | { ok: true; bookingId: string; date: string; when: string; total: number; subtotal: number; hst: number; lines: { label: string; amount: number }[]; message: string; end?: string; car?: string; payUrl?: string }
  | { ok: false; status: number; error: string; slots?: unknown };

type Opts = {
  source: "website" | "phone";
  bookedBy?: string; anyTime?: boolean; priceOverride?: number | null; customerId?: string | null;
  // internal, for several cars on one visit
  groupId?: string; noTravel?: boolean; silent?: boolean;
  // fleets: book this exact vehicle (8 identical vans are 8 vehicles), billed on the fleet's invoice
  vehicleId?: string; fleetAccountId?: string;
};

/** One car, or several cars on the same visit (back to back, one travel fee, one text and one link). */
export async function createBooking(b: BookingInput, opts: Opts): Promise<BookingResult> {
  // a time held for them on the phone: it's theirs, even though it shows as taken to everyone else
  const hold = b.holdToken ? await holdByToken(b.holdToken) : null;
  if (hold && holdIsLive(hold) && new Date(hold.starts_at).getTime() === new Date(b.start).getTime()) {
    opts = { ...opts, anyTime: true };
    b = { ...b, notes: [b.notes, `Time held on the phone by ${hold.created_by ? hold.created_by[0].toUpperCase() + hold.created_by.slice(1) : "us"}`].filter(Boolean).join(" · ") };
  }
  const r = await createBookingInner(b, opts);
  if (r.ok && hold && b.holdToken) await useHold(b.holdToken, r.bookingId);
  return r;
}

async function createBookingInner(b: BookingInput, opts: Opts): Promise<BookingResult> {
  if (!b.moreCars?.length) return createOne(b, opts);
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  const cars: BookingInput[] = [{ ...b, moreCars: undefined, cars: 1 },
    ...b.moreCars.map((m) => ({ ...b, car: m.car, job: m.job, addons: m.addons, own: m.own ?? null, notes: m.notes, photos: undefined, vin: m.vin, moreCars: undefined, cars: 1 }))];
  const clean = (x: BookingInput) => (x.job === "oil_change" ? x.addons : x.job === "seasonal" || x.job === "parts" ? x.addons.filter((a) => a !== "tires") : []);
  const total = cars.reduce((t, x) => t + minutesFor(x.job, rules, clean(x)), 0);
  const start = new Date(b.start);
  const date = halifaxDate(start);
  let when = label(halifaxMinutes(start));
  if (!opts.anyTime) {
    // the whole visit has to fit; a parts run is needed if any oil change's filter isn't on the shelf
    const day = await dayAvailability(date, { cars: 1, minutes: total, filterInStock: false });
    const slot = day.slots.find((s) => s.start === start.toISOString());
    if (!slot) return { ok: false, status: 409, error: "Sorry, that time doesn't have room for all the cars. Please pick another time.", slots: day.slots };
    when = slot.label;
  }
  const groupId = crypto.randomUUID();
  const made: { id: string; total: number; car: string; lines: { label: string; amount: number }[]; subtotal: number; hst: number }[] = [];
  let next = start.toISOString();
  for (let i = 0; i < cars.length; i++) {
    const r = await createOne({ ...cars[i], start: next }, { ...opts, anyTime: true, groupId, noTravel: i > 0, silent: true, ...(i > 0 ? { priceOverride: null } : {}) });   // a special price is for car 1
    if (!r.ok) {
      for (const m of made) await sbPatch("bookings", `id=eq.${m.id}`, { status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "system: rest of the visit couldn't be booked" });
      return r.status === 409 ? { ...r, error: "Sorry, that time doesn't have room for all the cars. Please pick another time." } : r;
    }
    made.push({ id: r.bookingId, total: r.total, car: r.car ?? "", lines: r.lines, subtotal: r.subtotal, hst: r.hst });
    next = r.end!;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const sum = r2(made.reduce((t, m) => t + m.total, 0));
  const carList = made.map((m) => m.car).join(" and ");

  // one alert for the owners, one text for the customer
  const who = opts.bookedBy ? `${opts.bookedBy[0].toUpperCase()}${opts.bookedBy.slice(1)} booked` : "New booking";
  const dayWord = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric" }).format(start);
  const title = `${who}: ${when}, ${made.length} cars (${carList})`;
  const body = `${b.firstName} ${b.lastName}`.trim() + ` · ${b.address} · $${sum.toFixed(2)} for ${made.length} cars, back to back`;
  try { await sbInsert("notifications", { kind: "new_booking", booking_id: made[0].id, title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title: title.replace(`: ${when},`, `: ${dayWord} ${when},`), body, url: `/owner?date=${date}`, tag: made[0].id }), new Promise((res) => setTimeout(res, 4000))]);
  await Promise.race([sendBookingConfirmation(made[0].id, { payingNow: b.payMode === "online" && !opts.bookedBy, car: carList, total: sum }).catch(() => null), new Promise((res) => setTimeout(res, 4000))]);

  const [first] = await sbGet<{ manage_token: string }>(`bookings?select=manage_token&id=eq.${made[0].id}`);
  return { ok: true, bookingId: made[0].id, date, when, total: sum, subtotal: r2(made.reduce((t, m) => t + m.subtotal, 0)), hst: r2(made.reduce((t, m) => t + m.hst, 0)),
    lines: made.flatMap((m) => m.lines.map((l) => ({ label: `${m.car}: ${l.label}`, amount: l.amount }))),
    message: `You're booked for ${when}. See you then!`, ...(b.payMode === "online" && !opts.bookedBy && first ? { payUrl: `/pay/${first.manage_token}` } : {}) };
}

async function createOne(b: BookingInput, opts: Opts & {
  source: "website" | "phone";
  bookedBy?: string;             // owner name when booked by phone
  anyTime?: boolean;             // owners can book outside the usual hours (still no double booking)
  priceOverride?: number | null; // owners can set a special price (before HST)
  customerId?: string | null;    // owners picked an existing customer: update them instead of making a duplicate
}): Promise<BookingResult> {
  // 1) Price, worked out on the server
  if (b.job !== "oil_change") b = { ...b, addons: b.addons.filter((a) => a !== "tires") };   // tires only add on to an oil change
  const inSeason = !!seasonFor(halifaxDate(new Date(b.start)), await seasonWindows());
  if (b.job === "seasonal" && !opts.anyTime && !inSeason) {
    return { ok: false, status: 400, error: "The seasonal package is only offered at the start of winter and summer. Book an oil change or a tire change instead." };
  }
  if (b.job === "diagnostic" || b.job === "tires" || b.job === "rotation") b = { ...b, addons: [] };
  if (!needsSomething(b)) return { ok: false, status: 400, error: "Pick at least one part for a parts visit." };
  const withOil = b.job === "oil_change" || b.job === "seasonal";
  // Travel: worked out here from the address, never trusted from the browser. Without a maps key it falls back to what was sent.
  const dist = mapsReady() ? await drivingDistance(b.placeId ? { placeId: b.placeId } : { address: b.address }).catch(() => null) : null;
  const km = opts.noTravel ? null : mapsReady() ? dist?.km ?? null : b.km ?? null;   // travel is charged once per visit
  const { quote, spec, rules } = await buildQuote({ ...b.car, job: b.job, addons: b.addons, own: withOil ? b.own ?? null : null, km, cars: b.cars, inSeason,
    date: opts.fleetAccountId ? null : halifaxDate(new Date(b.start)) });   // the Christmas deal goes by the visit date (fleets have their own prices)
  const noDistance = mapsReady() && !dist && !opts.noTravel;
  if (opts.priceOverride != null && opts.priceOverride >= 0) {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const sub = r2(opts.priceOverride);
    quote.lines = [{ label: opts.fleetAccountId ? (quote.lines[0]?.label ?? "Oil change").replace(/^(Full synthetic oil change|Diesel oil change)/, "$1, fleet price") : `Special price (normally $${quote.subtotal.toFixed(2)})`, amount: sub }];
    quote.subtotal = sub;
    quote.hst = r2(sub * Number(rules.hst_rate ?? 0.14));
    quote.total = r2(sub + quote.hst);
    if (quote.cost != null) quote.profit = r2(sub - quote.cost);
  }

  // 2) Time: customers must pick an open slot; owners can pick any time that isn't taken
  const start = new Date(b.start);
  const date = halifaxDate(start);
  const perCar = minutesFor(b.job, rules, b.addons);
  const jobMinutes = perCar * b.cars;
  let slotStart = start.toISOString();
  let slotEnd = new Date(start.getTime() + jobMinutes * 60000).toISOString();
  let when = label(halifaxMinutes(start));
  if (!opts.anyTime) {
    const day = await dayAvailability(date, { cars: b.cars, minutes: perCar,
      filterInStock: b.job === "diagnostic" || b.job === "tires" || b.job === "rotation" ? true : b.job === "parts" ? false : await filterInStock(spec?.oil_filter_part) });
    const slot = day.slots.find((s) => s.start === start.toISOString());
    if (!slot) return { ok: false, status: 409, error: "Sorry, that time was just taken. Please pick another time.", slots: day.slots };
    slotStart = slot.start; slotEnd = slot.end; when = slot.label;
  }

  // 3) Find or create the customer. Owners who picked someone update that record (fill in a missing phone or address).
  const phone = e164(b.phone);
  let customer: { id: string } | undefined;
  if (opts.customerId) {
    const [c] = await sbGet<{ id: string; phone: string | null; address: string | null; email: string | null }>(
      `customers?select=id,phone,address,email&id=eq.${enc(opts.customerId)}`);
    if (c) {
      customer = c;
      const [phoneOwner] = c.phone === phone ? [] : await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`);
      const patch: Record<string, string> = {};
      if (!phoneOwner && c.phone !== phone) patch.phone = phone;   // only if no one else already has that number
      if (!c.address && b.address) patch.address = b.address;
      if (!c.email && b.email) patch.email = b.email;
      if (Object.keys(patch).length) {
        await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/customers?id=eq.${c.id}`, {
          method: "PATCH", headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(patch),
        });
      }
    }
  }
  if (!customer) [customer] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`);
  if (!customer) {
    const c = await sbInsert<{ id: string }>("customers", {
      first_name: b.firstName, last_name: b.lastName || null, phone, email: b.email || null, address: b.address, source: opts.source,
    });
    if (!c.ok) throw new Error(`customer: ${JSON.stringify(c.error)}`);
    customer = c.data!;
  }

  // 4) Find or create the car (a VIN read from their photo is saved on it)
  const vin = vinOk(b.vin) ? cleanVin(b.vin) : null;
  const decoded = vin ? await decodeVin(vin).catch(() => null) : null;
  const vinCar = decoded ? [decoded.year, decoded.make, decoded.model, decoded.engineL ? `${decoded.engineL}L` : null, /diesel/i.test(decoded.fuel || "") ? "diesel" : null].filter(Boolean).join(" ") : null;
  const sameCar = !decoded || ((!decoded.year || decoded.year === b.car.year) && (!decoded.make || decoded.make.toLowerCase() === b.car.make.toLowerCase()));
  let [vehicle] = opts.vehicleId ? [{ id: opts.vehicleId, spec_id: null as string | null }] : await sbGet<{ id: string; spec_id: string | null }>(
    `vehicles?select=id,spec_id&customer_id=eq.${customer.id}&year=eq.${b.car.year}&make=ilike.${enc(b.car.make)}&model=ilike.${enc(b.car.model)}`);
  if (!vehicle) {
    const v = await sbInsert<{ id: string; spec_id: string | null }>("vehicles", {
      customer_id: customer.id, year: b.car.year, make: b.car.make, model: b.car.model, engine: b.car.engine || null, ...(vin ? { vin } : {}),
      spec_id: spec?.id ?? null, source: opts.source,
    });
    if (!v.ok) throw new Error(`vehicle: ${JSON.stringify(v.error)}`);
    vehicle = v.data!;
  } else {
    // a car we already had: save its VIN, and link it to its oil spec and part numbers if it wasn't yet
    const patch: Record<string, unknown> = {};
    if (vin) patch.vin = vin;
    if (spec?.id && !vehicle.spec_id && !opts.vehicleId) patch.spec_id = spec.id;
    if (Object.keys(patch).length) await sbPatch("vehicles", `id=eq.${vehicle.id}`, patch);
  }

  // 4b) On a maintenance plan? The oil change (and their swaps) are covered, filter and wiper labour free, small top-ups included.
  let planId: string | null = null;
  if (!opts.fleetAccountId && opts.priceOverride == null && (withOil || b.job === "tires")) {
    const pl = await planFor(customer.id, vehicle.id, b.start).catch(() => null);
    if (pl) {   // even when this month's oil change is used, labour on filters and wipers is still free
      const c = applyPlan(quote.lines, { oilLeft: withOil && pl.oilLeft, swapLeft: pl.swapLeft && (b.job === "tires" || b.job === "seasonal" || b.addons.includes("tires")), hstRate: Number(rules.hst_rate ?? 0.14) });
      quote.lines = c.lines; quote.subtotal = c.subtotal; quote.hst = c.hst; quote.total = c.total;
      if (quote.cost != null) quote.profit = Math.round((c.subtotal - quote.cost + (c.oilCovered ? Number(pl.plan.per_visit) : 0)) * 100) / 100;   // the plan's monthly payments pay for the oil change
      if (c.oilCovered || c.lines.some((l) => /^Tire change, covered/.test(l.label))) planId = pl.plan.id;   // only covered visits count toward the plan
    }
  }

  // 4c) Referrals: tie a new customer to whoever sent them, and take any credits off this booking (fleets excluded)
  let creditIds: string[] = [];
  if (!opts.fleetAccountId) {
    if (b.refCode || b.referredBy) await setReferredBy(customer.id, await findReferrer({ code: b.refCode, text: b.referredBy }).catch(() => null)).catch(() => null);
    const cr = await takeCredits(customer.id, quote.subtotal).catch(() => null);
    if (cr?.total) {
      Object.assign(quote, addLines(quote, cr.lines, Number(rules.hst_rate ?? 0.14)));
      creditIds = cr.ids;
    }
  }
  if (b.referredBy && !b.refCode) b = { ...b, notes: [b.notes, `Referred by: ${b.referredBy}`].filter(Boolean).join(" · ") };

  // 5) Book it. The database refuses it if the time overlaps another booking.
  const manageToken = newManageToken();
  const bk = await sbInsert<{ id: string }>("bookings", {
    customer_id: customer.id, vehicle_id: vehicle.id, starts_at: slotStart, ends_at: slotEnd, address: b.address,
    distance_km: km, status: "confirmed", pay_mode: opts.fleetAccountId ? "fleet_invoice" : opts.bookedBy ? b.payMode : "after",   // website: becomes "online" only once Converge confirms the payment
    quoted_total: quote.total, quote_breakdown: quote, cars: b.cars,
    services: { job: b.job, addons: b.addons, own: withOil ? b.own ?? null : null, bookedBy: opts.bookedBy ?? null, ...(vin ? { vin, vinCar } : {}), ...(b.agreeTerms ? { termsAgreedAt: new Date().toISOString() } : {}) }, needs_review: [...quote.needsReview, ...(noDistance ? ["Address not found on the map: check it, and add a travel fee if it's past 30 km"] : []),
      ...(b.photos?.length && !vin ? ["Customer sent a VIN photo we couldn't read: look at it before you go"] : []),
      ...(vin && !sameCar ? [`VIN says ${vinCar}, but they booked a ${b.car.year} ${b.car.make} ${b.car.model}: check which car it is`] : [])],
    photo_paths: b.photos?.length ? b.photos : null,
    source: opts.source, notes: b.notes || null, manage_token: manageToken, ...(opts.groupId ? { group_id: opts.groupId } : {}), ...(opts.fleetAccountId ? { fleet_account_id: opts.fleetAccountId } : {}), ...(planId ? { plan_id: planId } : {}),
  });
  if (!bk.ok) {
    if (bk.status === 409 || JSON.stringify(bk.error).includes("23P01")) {
      return { ok: false, status: 409, error: opts.anyTime ? "That time overlaps another job. Pick a different time." : "Sorry, that time was just taken. Please pick another time." };
    }
    throw new Error(`booking: ${JSON.stringify(bk.error)}`);
  }

  await markCreditsUsed(creditIds, bk.data!.id);

  const carName = `${b.car.year} ${b.car.make} ${b.car.model}`;
  if (opts.silent) return { ok: true, bookingId: bk.data!.id, date, when, total: quote.total, subtotal: quote.subtotal, hst: quote.hst, lines: quote.lines, message: "", end: slotEnd, car: carName };

  // 6) Alert in the calendar app + buzz both phones
  const who = opts.bookedBy ? `${opts.bookedBy[0].toUpperCase()}${opts.bookedBy.slice(1)} booked` : "New booking";
  const title = `${who}: ${when}, ${b.car.year} ${b.car.make} ${b.car.model}${b.job === "parts" ? " (parts only)" : b.job === "diagnostic" ? " (diagnostic)" : b.job === "tires" ? " (tire change)" : b.job === "rotation" ? " (tire rotation)" : b.job === "seasonal" ? " (seasonal package)" : b.addons.includes("tires") ? " + tires" : ""}`;
  // what to bring, right in the alert: oil, how much, and the filter number (in stock or buy)
  const bring = withOil && spec && b.own !== "both" ? ` · ${spec.oil_grade.replace(/^Euro /, "")}${spec.oil_spec && !/^API/i.test(spec.oil_spec) ? ` (${spec.oil_spec})` : ""} ${Number(spec.capacity_l)} L`
    + (spec.oil_filter_part && b.own !== "filter" ? ` · filter NAPA ${spec.oil_filter_part} (${(await filterInStock(spec.oil_filter_part).catch(() => false)) ? "in stock" : "buy"})` : spec.oil_filter_part ? "" : " · filter: find on site") : "";
  // part numbers we've used on this car before, for the add-ons they picked
  const partNo = [
    b.addons.includes("cabin_filter") && spec?.cabin_filter_part ? `cabin filter ${spec.cabin_filter_part}` : null,
    b.addons.includes("engine_filter") && spec?.air_filter_part ? `air filter ${spec.air_filter_part}` : null,
    b.addons.includes("wipers") && (spec?.wiper_driver || spec?.wiper_passenger) ? `wipers ${[spec?.wiper_driver, spec?.wiper_passenger].filter(Boolean).join(" / ")}` : null,
  ].filter(Boolean).join(" · ");
  const body = `${b.firstName} ${b.lastName}`.trim() + ` · ${b.address} · $${quote.total.toFixed(2)} ${b.payMode === "online" ? (opts.bookedBy ? "already paid" : "paying online now") : "pay after"}${bring}${partNo ? ` · ${partNo}` : ""}`;
  try { await sbInsert("notifications", { kind: "new_booking", booking_id: bk.data!.id, title, body }); }
  catch (e) { console.error("alert failed", e); }
  const dayWord = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric" }).format(new Date(slotStart));
  await Promise.race([
    pushToOwners({ title: title.replace(`: ${when},`, `: ${dayWord} ${when},`), body, url: `/owner?date=${date}`, tag: bk.data!.id }),
    new Promise((r) => setTimeout(r, 4000)),   // never make the customer wait on a slow push
  ]);

  // 7) Confirmation text to the customer (with their change/cancel link)
  await Promise.race([sendBookingConfirmation(bk.data!.id, { payingNow: b.payMode === "online" && !opts.bookedBy }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);

  return { ok: true, bookingId: bk.data!.id, date, when, total: quote.total, subtotal: quote.subtotal, hst: quote.hst, lines: quote.lines,
    message: `You're booked for ${when}. See you then!`, ...(b.payMode === "online" && !opts.bookedBy ? { payUrl: `/pay/${manageToken}` } : {}) };
}

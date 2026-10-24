// One place that creates bookings, used by the customer website and by owners booking by phone.
import { z } from "zod";
import { sbGet, sbInsert, sbHeaders, enc } from "@/lib/os/db";
import { buildQuote, filterInStock } from "@/lib/os/quote-service";
import { drivingDistance, mapsReady } from "@/lib/os/maps";
import { dayAvailability, jobMinutes as minutesFor, seasonWindows } from "@/lib/os/calendar";
import { seasonFor } from "@/lib/os/seasons";
import { pushToOwners } from "@/lib/os/push";
import { newManageToken, sendBookingConfirmation } from "@/lib/os/customer-texts";
import { halifaxDate, label } from "@/lib/os/slots";

export const BookingBody = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(4).max(200),
  car: z.object({ year: z.number().int().min(1980).max(2030), make: z.string().trim().min(1), model: z.string().trim().min(1), engine: z.string().trim().optional() }),
  job: z.enum(["oil_change", "seasonal", "parts", "diagnostic", "tires"]).optional().default("oil_change"),
  addons: z.array(z.enum(["wipers", "cabin_filter", "engine_filter", "battery", "tires", "coolant", "washer_fluid"])).optional().default([]),
  own: z.enum(["both", "oil", "filter"]).nullable().optional(),
  start: z.string().datetime(),
  cars: z.number().int().min(1).max(5).optional().default(1),
  payMode: z.enum(["online", "after"]).default("after"),
  notes: z.string().max(1000).optional(),
  km: z.number().min(0).max(300).optional(),
  placeId: z.string().max(300).optional(),    // picked from the address suggestions
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
  | { ok: true; bookingId: string; date: string; when: string; total: number; subtotal: number; hst: number; lines: { label: string; amount: number }[]; message: string }
  | { ok: false; status: number; error: string; slots?: unknown };

export async function createBooking(b: BookingInput, opts: {
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
  if (b.job === "diagnostic" || b.job === "tires") b = { ...b, addons: [] };
  if (!needsSomething(b)) return { ok: false, status: 400, error: "Pick at least one part for a parts visit." };
  const withOil = b.job === "oil_change" || b.job === "seasonal";
  // Travel: worked out here from the address, never trusted from the browser. Without a maps key it falls back to what was sent.
  const dist = mapsReady() ? await drivingDistance(b.placeId ? { placeId: b.placeId } : { address: b.address }).catch(() => null) : null;
  const km = mapsReady() ? dist?.km ?? null : b.km ?? null;
  const { quote, spec, rules } = await buildQuote({ ...b.car, job: b.job, addons: b.addons, own: withOil ? b.own ?? null : null, km, cars: b.cars, inSeason });
  const noDistance = mapsReady() && !dist;
  if (opts.priceOverride != null && opts.priceOverride >= 0) {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const sub = r2(opts.priceOverride);
    quote.lines = [{ label: `Special price (normally $${quote.subtotal.toFixed(2)})`, amount: sub }];
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
      filterInStock: b.job === "diagnostic" || b.job === "tires" ? true : b.job === "parts" ? false : await filterInStock(spec?.oil_filter_part) });
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

  // 4) Find or create the car
  let [vehicle] = await sbGet<{ id: string }>(
    `vehicles?select=id&customer_id=eq.${customer.id}&year=eq.${b.car.year}&make=ilike.${enc(b.car.make)}&model=ilike.${enc(b.car.model)}`);
  if (!vehicle) {
    const v = await sbInsert<{ id: string }>("vehicles", {
      customer_id: customer.id, year: b.car.year, make: b.car.make, model: b.car.model, engine: b.car.engine || null,
      spec_id: spec?.id ?? null, source: opts.source,
    });
    if (!v.ok) throw new Error(`vehicle: ${JSON.stringify(v.error)}`);
    vehicle = v.data!;
  }

  // 5) Book it. The database refuses it if the time overlaps another booking.
  const bk = await sbInsert<{ id: string }>("bookings", {
    customer_id: customer.id, vehicle_id: vehicle.id, starts_at: slotStart, ends_at: slotEnd, address: b.address,
    distance_km: km, status: "confirmed", pay_mode: b.payMode,
    quoted_total: quote.total, quote_breakdown: quote, cars: b.cars,
    services: { job: b.job, addons: b.addons, own: withOil ? b.own ?? null : null, bookedBy: opts.bookedBy ?? null }, needs_review: [...quote.needsReview, ...(noDistance ? ["Address not found on the map: check it, and add a travel fee if it's past 30 km"] : [])],
    source: opts.source, notes: b.notes || null, manage_token: newManageToken(),
  });
  if (!bk.ok) {
    if (bk.status === 409 || JSON.stringify(bk.error).includes("23P01")) {
      return { ok: false, status: 409, error: opts.anyTime ? "That time overlaps another job. Pick a different time." : "Sorry, that time was just taken. Please pick another time." };
    }
    throw new Error(`booking: ${JSON.stringify(bk.error)}`);
  }

  // 6) Alert in the calendar app + buzz both phones
  const who = opts.bookedBy ? `${opts.bookedBy[0].toUpperCase()}${opts.bookedBy.slice(1)} booked` : "New booking";
  const title = `${who}: ${when}, ${b.car.year} ${b.car.make} ${b.car.model}${b.job === "parts" ? " (parts only)" : b.job === "diagnostic" ? " (diagnostic)" : b.job === "tires" ? " (tire change)" : b.job === "seasonal" ? " (seasonal package)" : b.addons.includes("tires") ? " + tires" : ""}`;
  const body = `${b.firstName} ${b.lastName}`.trim() + ` · ${b.address} · $${quote.total.toFixed(2)} ${b.payMode === "online" ? "paid online" : "pay after"}`;
  try { await sbInsert("notifications", { kind: "new_booking", booking_id: bk.data!.id, title, body }); }
  catch (e) { console.error("alert failed", e); }
  const dayWord = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric" }).format(new Date(slotStart));
  await Promise.race([
    pushToOwners({ title: title.replace(`: ${when},`, `: ${dayWord} ${when},`), body, url: `/owner?date=${date}`, tag: bk.data!.id }),
    new Promise((r) => setTimeout(r, 4000)),   // never make the customer wait on a slow push
  ]);

  // 7) Confirmation text to the customer (with their change/cancel link)
  await Promise.race([sendBookingConfirmation(bk.data!.id).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);

  return { ok: true, bookingId: bk.data!.id, date, when, total: quote.total, subtotal: quote.subtotal, hst: quote.hst, lines: quote.lines,
    message: `You're booked for ${when}. See you then!` };
}

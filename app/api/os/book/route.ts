// Create a booking. The price is worked out again here so it can't be changed in the browser,
// the slot is checked again, and the database refuses overlaps if two people click at once.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { buildQuote, filterInStock } from "@/lib/os/quote-service";
import { dayAvailability } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
// New bookings appear in the owner calendar app as an alert (no emails).
async function alertOwners(title: string, body: string, bookingId: string) {
  try { await sbInsert("notifications", { kind: "new_booking", title, body, booking_id: bookingId }); }
  catch (e) { console.error("alert failed", e); }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(4).max(200),
  car: z.object({ year: z.number().int().min(1980).max(2030), make: z.string().trim().min(1), model: z.string().trim().min(1), engine: z.string().trim().optional() }),
  addons: z.array(z.enum(["wipers", "cabin_filter", "engine_filter", "battery"])).optional().default([]),
  own: z.enum(["both", "oil", "filter"]).nullable().optional(),
  start: z.string().datetime(),
  cars: z.number().int().min(1).max(5).optional().default(1),
  payMode: z.enum(["online", "after"]).default("after"),
  notes: z.string().max(1000).optional(),
  km: z.number().min(0).max(300).optional(),
});

function e164(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form", details: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  try {
    // 1) Price, worked out on the server
    const { quote, spec } = await buildQuote({ ...b.car, addons: b.addons, own: b.own ?? null, km: b.km ?? null, cars: b.cars });

    // 2) Is that start time still free?
    const start = new Date(b.start);
    const date = halifaxDate(start);
    const day = await dayAvailability(date, { cars: b.cars, filterInStock: await filterInStock(spec?.oil_filter_part) });
    const slot = day.slots.find((s) => s.start === start.toISOString());
    if (!slot) return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another time.", slots: day.slots }, { status: 409 });

    // 3) Find or create the customer (by phone)
    const phone = e164(b.phone);
    let [customer] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`);
    if (!customer) {
      const c = await sbInsert<{ id: string }>("customers", {
        first_name: b.firstName, last_name: b.lastName || null, phone, email: b.email || null, address: b.address, source: "website",
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
        spec_id: spec?.id ?? null, source: "website",
      });
      if (!v.ok) throw new Error(`vehicle: ${JSON.stringify(v.error)}`);
      vehicle = v.data!;
    }

    // 5) Book it. The database refuses it if someone else got there first.
    const bk = await sbInsert<{ id: string }>("bookings", {
      customer_id: customer.id, vehicle_id: vehicle.id, starts_at: slot.start, ends_at: slot.end, address: b.address,
      distance_km: b.km ?? null, status: "confirmed", pay_mode: b.payMode,
      quoted_total: quote.total, quote_breakdown: quote, cars: b.cars,
      services: { addons: b.addons, own: b.own ?? null }, needs_review: quote.needsReview, source: "website", notes: b.notes || null,
    });
    if (!bk.ok) {
      if (bk.status === 409 || JSON.stringify(bk.error).includes("23P01")) {
        return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another time." }, { status: 409 });
      }
      throw new Error(`booking: ${JSON.stringify(bk.error)}`);
    }

    await alertOwners(
      `New booking: ${slot.label}, ${b.car.year} ${b.car.make} ${b.car.model}`,
      `${b.firstName} ${b.lastName}`.trim() + ` · ${b.address} · $${quote.total.toFixed(2)} ${b.payMode === "online" ? "paid online" : "pay after"}`,
      bk.data!.id,
    );

    return NextResponse.json({
      ok: true, bookingId: bk.data!.id, status: "confirmed",
      when: slot.label, date, total: quote.total, lines: quote.lines, subtotal: quote.subtotal, hst: quote.hst,
      message: `You're booked for ${slot.label}. See you then!`,
    });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong. Please call or text 782-640-8341.", detail: String(e) }, { status: 500 });
  }
}

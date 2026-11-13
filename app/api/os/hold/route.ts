// GET ?t=TOKEN → the time we're holding for a caller (the booking page fills itself in from this).
import { NextRequest, NextResponse } from "next/server";
import { holdByToken, holdIsLive, holdAddons } from "@/lib/os/holds";
import { halifaxDate } from "@/lib/os/slots";
import { when, timeOnly } from "@/lib/os/customer-texts";
import { sbGet } from "@/lib/os/db";
import type { Extract } from "@/lib/os/calls";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const h = await holdByToken(req.nextUrl.searchParams.get("t") || "");
  if (!h) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = holdIsLive(h);
  // held from a call: everything they told us comes along (name, address, email, engine, add-ons, the problem)
  const callId = (h as { call_id?: string | null }).call_id;
  const [c] = live && callId ? await sbGet<{ extract: Extract | null }>(`calls?select=extract&id=eq.${callId}`).catch(() => []) : [];
  const x = c?.extract;
  // a customer we already have (link sent from their page in HQ): their saved details and car
  let known: { lastName: string | null; address: string | null; email: string | null; car: { year: number; make: string; model: string | null; engine: string | null } | null } | null = null;
  if (live && !x && h.phone) {
    const [cu] = await sbGet<{ id: string; last_name: string | null; address: string | null; email: string | null }>(`customers?select=id,last_name,address,email&phone=eq.${encodeURIComponent(h.phone)}&limit=1`).catch(() => []);
    if (cu) {
      const [v] = await sbGet<{ year: number | null; make: string | null; model: string | null; engine: string | null }>(`vehicles?select=year,make,model,engine&customer_id=eq.${cu.id}&order=created_at.desc&limit=1`).catch(() => []);
      known = { lastName: cu.last_name, address: cu.address, email: cu.email, car: v?.year && v.make ? { year: v.year, make: v.make, model: v.model, engine: v.engine } : null };
    }
  }
  const tagged = holdAddons(h.note);
  return NextResponse.json({
    live, used: h.status === "booked", start: new Date(h.starts_at).toISOString(), date: halifaxDate(new Date(h.starts_at)), when: when(h.starts_at),
    label: timeOnly(h.starts_at), until: timeOnly(h.expires_at), job: h.job, cars: h.cars, firstName: live ? h.first_name : null, phone: live ? h.phone : null,
    ...(x ? { lastName: x.lastName ?? null, address: x.address ?? null, email: x.email ?? null, engine: x.engine ?? null, addons: x.addons ?? [], problem: x.problem ?? null, notes: x.notes ?? null } : {}),
    ...(known ? { lastName: known.lastName, address: known.address, email: known.email, engine: known.car?.engine ?? null } : {}),
    ...(tagged.length ? { addons: tagged } : {}),
    car: known?.car ? { year: known.car.year, make: known.car.make, model: known.car.model } : live && (h as { car_year?: number | null }).car_year ? { year: (h as { car_year?: number }).car_year, make: (h as { car_make?: string }).car_make, model: (h as { car_model?: string }).car_model } : null,
  });
}

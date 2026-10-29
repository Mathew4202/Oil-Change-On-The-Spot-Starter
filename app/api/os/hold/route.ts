// GET ?t=TOKEN → the time we're holding for a caller (the booking page fills itself in from this).
import { NextRequest, NextResponse } from "next/server";
import { holdByToken, holdIsLive } from "@/lib/os/holds";
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
  return NextResponse.json({
    live, used: h.status === "booked", start: new Date(h.starts_at).toISOString(), date: halifaxDate(new Date(h.starts_at)), when: when(h.starts_at),
    label: timeOnly(h.starts_at), until: timeOnly(h.expires_at), job: h.job, cars: h.cars, firstName: live ? h.first_name : null, phone: live ? h.phone : null,
    ...(x ? { lastName: x.lastName ?? null, address: x.address ?? null, email: x.email ?? null, engine: x.engine ?? null, addons: x.addons ?? [], problem: x.problem ?? null, notes: x.notes ?? null } : {}),
    car: live && (h as { car_year?: number | null }).car_year ? { year: (h as { car_year?: number }).car_year, make: (h as { car_make?: string }).car_make, model: (h as { car_model?: string }).car_model } : null,
  });
}

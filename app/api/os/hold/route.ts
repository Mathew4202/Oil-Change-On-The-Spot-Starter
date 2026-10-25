// GET ?t=TOKEN → the time we're holding for a caller (the booking page fills itself in from this).
import { NextRequest, NextResponse } from "next/server";
import { holdByToken, holdIsLive } from "@/lib/os/holds";
import { halifaxDate } from "@/lib/os/slots";
import { when, timeOnly } from "@/lib/os/customer-texts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const h = await holdByToken(req.nextUrl.searchParams.get("t") || "");
  if (!h) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = holdIsLive(h);
  return NextResponse.json({
    live, used: h.status === "booked", start: new Date(h.starts_at).toISOString(), date: halifaxDate(new Date(h.starts_at)), when: when(h.starts_at),
    label: timeOnly(h.starts_at), until: timeOnly(h.expires_at), job: h.job, cars: h.cars, firstName: live ? h.first_name : null, phone: live ? h.phone : null,
    car: live && (h as { car_year?: number | null }).car_year ? { year: (h as { car_year?: number }).car_year, make: (h as { car_make?: string }).car_make, model: (h as { car_model?: string }).car_model } : null,
  });
}

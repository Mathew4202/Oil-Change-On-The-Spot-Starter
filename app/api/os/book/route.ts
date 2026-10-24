// Customer booking from the website. The price and the time are both checked again on the server,
// and the database refuses overlaps if two people click at once.
import { NextRequest, NextResponse } from "next/server";
import { BookingBody, createBooking } from "@/lib/os/booking";
import { PHONE } from "@/lib/os/business";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const parsed = BookingBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form", details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.agreeTerms !== true) return NextResponse.json({ error: "Please tick the box to agree to the cancellation terms." }, { status: 400 });
  try {
    const r = await createBooking(parsed.data, { source: "website" });
    if (!r.ok) return NextResponse.json({ error: r.error, slots: r.slots }, { status: r.status });
    return NextResponse.json({ ...r, status: "confirmed" });
  } catch (e) {
    return NextResponse.json({ error: `Something went wrong. Please call or text ${PHONE}.`, detail: String(e) }, { status: 500 });
  }
}

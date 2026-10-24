// Owners booking a customer by phone. Any time is allowed (not just open hours), but never a double booking.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentOwner } from "@/lib/os/auth";
import { BookingBody, createBooking } from "@/lib/os/booking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OwnerBody = BookingBody.extend({
  address: z.string().trim().min(2).max(200),
  priceOverride: z.number().min(0).max(5000).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const parsed = OwnerBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: `Please check: ${Object.keys(f).join(", ")}` }, { status: 400 });
  }
  try {
    const { priceOverride, customerId, ...b } = parsed.data;
    const r = await createBooking(b, { source: "phone", bookedBy: owner, anyTime: true, priceOverride: priceOverride ?? null, customerId: customerId ?? null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: "Couldn't save the booking", detail: String(e) }, { status: 500 });
  }
}

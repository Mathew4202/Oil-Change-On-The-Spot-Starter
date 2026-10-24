// Owners: POST {bookingId, action: "cancel"|"move", start?, reason?, tellCustomer?}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { bookingById, cancelBooking, moveBooking } from "@/lib/os/manage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { bookingId, action, start, reason } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(bookingId || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const b = await bookingById(bookingId);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  const r = action === "cancel" ? await cancelBooking(b, owner, String(reason || "").slice(0, 200))
    : action === "move" ? await moveBooking(b, String(start || ""), owner)
    : { ok: false, error: "Unknown action" };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

// Owners: POST {bookingId, action: "cancel"|"move"|"price"|"edit", start?, reason?, tellCustomer?, price? (before HST), edit?}
// GET ?bookingId= → the details the edit screen fills in
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { bookingById, cancelBooking, moveBooking, setPrice, editBooking, bookingForEdit } from "@/lib/os/manage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("bookingId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const d = await bookingForEdit(id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Booking not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { bookingId, action, start, reason, chargeFee, price, edit, tell } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(bookingId || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const b = await bookingById(bookingId);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  const r = action === "cancel" ? await cancelBooking(b, owner, String(reason || "").slice(0, 200), { chargeFee: chargeFee === true })
    : action === "move" ? await moveBooking(b, String(start || ""), owner)
    : action === "price" ? await setPrice(b.id, Number(price), owner, tell === true)
    : action === "edit" ? await editBooking(b.id, edit && typeof edit === "object" ? edit : {}, owner)
    : { ok: false, error: "Unknown action" };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

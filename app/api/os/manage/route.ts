// Customer self-serve: GET ?t=TOKEN → booking; POST {t, action: "cancel"|"move", start?, reason?}
import { NextRequest, NextResponse } from "next/server";
import { bookingByToken, selfServeAllowed, cancelBooking, moveBooking } from "@/lib/os/manage";

export const dynamic = "force-dynamic";

function view(b: NonNullable<Awaited<ReturnType<typeof bookingByToken>>>) {
  return { id: b.id, start: b.starts_at, status: b.status, address: b.address, total: b.quoted_total, job: b.services?.job ?? "oil_change",
    addons: b.services?.addons ?? [], cars: b.cars, firstName: b.customers?.first_name ?? "",
    car: [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") };
}

export async function GET(req: NextRequest) {
  const b = await bookingByToken(req.nextUrl.searchParams.get("t") || "");
  if (!b) return NextResponse.json({ error: "We couldn't find that booking. Call or text 782-640-8341." }, { status: 404 });
  const { ok, hours } = await selfServeAllowed(b);
  return NextResponse.json({ booking: view(b), canChange: ok, freeCancelHours: hours });
}

export async function POST(req: NextRequest) {
  const { t, action, start, reason } = await req.json().catch(() => ({}));
  const b = await bookingByToken(String(t || ""));
  if (!b) return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 });
  const { ok, hours } = await selfServeAllowed(b);
  if (!ok) return NextResponse.json({ error: `Changes online close ${hours} hours before your time. Please call or text 782-640-8341.` }, { status: 400 });
  const r = action === "cancel" ? await cancelBooking(b, "customer", String(reason || "").slice(0, 200))
    : action === "move" ? await moveBooking(b, String(start || ""), "customer")
    : { ok: false, error: "Unknown action" };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

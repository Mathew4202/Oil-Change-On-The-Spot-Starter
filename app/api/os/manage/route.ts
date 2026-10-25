// Customer self-serve: GET ?t=TOKEN → booking; POST {t, action: "cancel"|"move", start?, reason?}
import { NextRequest, NextResponse } from "next/server";
import { bookingByToken, selfServeAllowed, cancelBooking, moveBooking, groupMembers, cancelGroup, moveGroup } from "@/lib/os/manage";
import { PHONE } from "@/lib/os/business";

export const dynamic = "force-dynamic";

function view(b: NonNullable<Awaited<ReturnType<typeof bookingByToken>>>) {
  return { id: b.id, start: b.starts_at, status: b.status, address: b.address, total: b.quoted_total, job: b.services?.job ?? "oil_change",
    addons: b.services?.addons ?? [], cars: b.cars, firstName: b.customers?.first_name ?? "",
    car: [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") };
}

export async function GET(req: NextRequest) {
  const b = await bookingByToken(req.nextUrl.searchParams.get("t") || "");
  if (!b) return NextResponse.json({ error: `We couldn't find that booking. Call or text ${PHONE}.` }, { status: 404 });
  const { ok, hours } = await selfServeAllowed(b);
  const group = await groupMembers(b);
  const v = view(b);
  if (group.length > 1) {   // several cars on one visit: show them all, total for the visit
    v.car = group.map((g) => [g.vehicles?.year, g.vehicles?.make, g.vehicles?.model].filter(Boolean).join(" ")).join(" and ");
    v.total = Math.round(group.reduce((t, g) => t + Number(g.quoted_total ?? 0), 0) * 100) / 100;
    v.cars = group.length;
    (v as typeof v & { visitMinutes?: number }).visitMinutes = Math.round((new Date(group[group.length - 1].ends_at).getTime() - new Date(group[0].starts_at).getTime()) / 60000);
  }
  return NextResponse.json({ booking: v, canChange: ok, freeCancelHours: hours });
}

export async function POST(req: NextRequest) {
  const { t, action, start, reason } = await req.json().catch(() => ({}));
  const b = await bookingByToken(String(t || ""));
  if (!b) return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 });
  const { ok, hours } = await selfServeAllowed(b);
  if (!ok) return NextResponse.json({ error: `Changes online close ${hours} hours before your time. Please call or text ${PHONE}.` }, { status: 400 });
  const group = await groupMembers(b);
  const r = group.length > 1
    ? action === "cancel" ? await cancelGroup(group, String(reason || "").slice(0, 200)) : action === "move" ? await moveGroup(group, String(start || ""), "customer") : { ok: false, error: "Unknown action" }
    : action === "cancel" ? await cancelBooking(b, "customer", String(reason || "").slice(0, 200))
    : action === "move" ? await moveBooking(b, String(start || ""), "customer")
    : { ok: false, error: "Unknown action" };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

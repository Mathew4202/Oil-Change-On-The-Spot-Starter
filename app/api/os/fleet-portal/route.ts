// The fleet's own page. GET ?t=TOKEN → their account · GET ?t=&date=&count= → open times · POST {t, action: book|vehicle}
import { NextRequest, NextResponse } from "next/server";
import { accountByPortal, portalView, portalTimes, portalBook, portalAddVehicle } from "@/lib/os/fleet-portal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const okId = (x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = await accountByPortal(q.get("t") || "");
  if (!id) return NextResponse.json({ error: "This link isn't working. Text us and we'll send a new one." }, { status: 404 });
  try {
    if (q.get("date")) return NextResponse.json(await portalTimes(id, q.get("date")!, Number(q.get("count") || 1)));
    return NextResponse.json(await portalView(id));
  } catch (e) {
    return NextResponse.json({ error: "Couldn't load. Try again in a minute.", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = await accountByPortal(String(b.t || ""));
  if (!id) return NextResponse.json({ error: "This link isn't working. Text us and we'll send a new one." }, { status: 404 });
  try {
    if (b.action === "book") {
      const ids = (Array.isArray(b.vehicleIds) ? b.vehicleIds : []).filter(okId).slice(0, 12);
      const r = await portalBook(id, ids, String(b.start || ""), String(b.note || "").slice(0, 300));
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (b.action === "vehicle") {
      const r = await portalAddVehicle(id, b.vehicle || {});
      return NextResponse.json(r.ok ? { ok: true } : r, { status: r.ok ? 200 : 400 });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong. Text us and we'll sort it out.", detail: String(e) }, { status: 500 });
  }
}

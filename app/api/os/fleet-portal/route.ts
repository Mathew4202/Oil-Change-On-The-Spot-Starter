// The fleet's own page. GET ?t=TOKEN → their account · GET ?t=&date=&count= → open times · POST {t, action: book|vehicle}
import { NextRequest, NextResponse } from "next/server";
import { accountByPortal, portalView, portalTimes, portalBook, portalAddVehicle, portalAddVehicles } from "@/lib/os/fleet-portal";
import { readVehicleList, fileFromDataUrl } from "@/lib/os/photo-read";
import { numberUnits } from "@/lib/os/fleet-list";
import { accountDetail } from "@/lib/os/fleet";

// photo reading uses the free AI: a few a day per fleet is plenty
const scans = new Map<string, number[]>();
const tooMany = (id: string) => { const now = Date.now(), l = (scans.get(id) ?? []).filter((t) => now - t < 86400000); l.push(now); scans.set(id, l); return l.length > 25; };

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
    if (b.action === "scan") {
      if (tooMany(id)) return NextResponse.json({ error: "That's a lot of photos today. Add the rest one at a time, or try tomorrow." }, { status: 429 });
      const f = fileFromDataUrl(b.file);
      if (!f) return NextResponse.json({ error: "Send a photo or a PDF under 4 MB" }, { status: 400 });
      const d = await accountDetail(id);
      const r = await readVehicleList(f);
      return NextResponse.json({ ...r, rows: numberUnits(r.rows, (d?.vehicles ?? []).map((v) => v.unit_number)), existingVins: (d?.vehicles ?? []).map((v) => v.vin).filter(Boolean), existingPlates: (d?.vehicles ?? []).map((v) => v.plate).filter(Boolean) });
    }
    if (b.action === "vehicles") {
      const r = await portalAddVehicles(id, Array.isArray(b.vehicles) ? b.vehicles.slice(0, 200) : []);
      return NextResponse.json(r);
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

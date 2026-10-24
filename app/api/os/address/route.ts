// Address box on the booking pages.
// GET ?q=77 colling&s=<session> → suggestions · GET ?place=<id>&s=<session> → full address + distance + travel fee · GET ?addr=<typed address> → distance + fee
import { NextRequest, NextResponse } from "next/server";
import { suggest, placeAddress, drivingDistance, mapsReady } from "@/lib/os/maps";
import { travelFee } from "@/lib/os/pricing-engine";
import { sbGet } from "@/lib/os/db";

export const dynamic = "force-dynamic";

async function freeKm() {
  try { const [r] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.free_travel_km"); return Number(r?.value ?? 30); } catch { return 30; }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const s = (sp.get("s") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  if (!mapsReady()) return NextResponse.json({ ready: false, suggestions: [] });
  const q = sp.get("q");
  if (q != null) return NextResponse.json({ ready: true, suggestions: q.trim().length >= 3 ? await suggest(q, s) : [] });

  const place = (sp.get("place") || "").slice(0, 300), addr = (sp.get("addr") || "").trim().slice(0, 200);
  if (!place && addr.length < 5) return NextResponse.json({ error: "Add an address" }, { status: 400 });
  const address = place ? await placeAddress(place, s) : addr;
  const d = await drivingDistance(place ? { placeId: place } : { address: addr });
  const free = await freeKm();
  return NextResponse.json({ ready: true, address: address ?? d?.address ?? addr, placeId: place || null,
    km: d?.km ?? null, minutes: d?.minutes ?? null, fee: d ? travelFee(d.km, free) : null, freeKm: free });
}

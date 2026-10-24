// GET → shelf + what the next 7 days need. POST {partId, delta, note} → manual count fix.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";

export const dynamic = "force-dynamic";
type Part = { id: string; part_number: string; brand: string | null; description: string | null; category: string | null; on_hand: number; unit: string | null; oil_grade: string | null; reorder_at: number | null };

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const today = halifaxDate(new Date());
  const from = new Date().toISOString(), to = new Date(halifaxToDate(today, 0).getTime() + 8 * 86400000).toISOString();
  const [parts, upcoming] = await Promise.all([
    sbGet<Part>("parts?select=id,part_number,brand,description,category,on_hand,unit,oil_grade,reorder_at&order=category,part_number"),
    sbGet<{ cars: number; services: { job?: string; own?: string | null } | null; vehicles: { vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null } | null } | null }>(
      `bookings?select=cars,services,vehicles(vehicle_specs(oil_grade,capacity_l,oil_filter_part))&status=in.(confirmed,requested)&starts_at=gte.${from}&starts_at=lt.${to}`),
  ]);
  // What the next 7 days need
  const needFilters: Record<string, number> = {}, needOil: Record<string, number> = {};
  for (const b of upcoming) {
    const s = b.vehicles?.vehicle_specs; const job = b.services?.job ?? "oil_change"; const own = b.services?.own;
    if (!s || !["oil_change", "seasonal"].includes(job) || own === "both") continue;
    const n = b.cars || 1;
    if (s.oil_filter_part && own !== "filter") needFilters[s.oil_filter_part] = (needFilters[s.oil_filter_part] || 0) + n;
    if (own !== "oil") { const g = s.oil_grade.replace(/^Euro /, "Euro "); needOil[g] = Math.round(((needOil[g] || 0) + Number(s.capacity_l) * n) * 10) / 10; }
  }
  const have = (pn: string) => parts.filter((p) => p.part_number === pn).reduce((t, p) => t + Number(p.on_hand), 0);
  const haveOil = (g: string) => parts.filter((p) => p.unit === "L" && (p.oil_grade === g || p.oil_grade === g.replace(/^Euro /, ""))).reduce((t, p) => t + Number(p.on_hand), 0);
  const toBuy = [
    ...Object.entries(needFilters).map(([pn, need]) => ({ kind: "filter", label: `Oil filter ${pn}`, need, have: have(pn), unit: "" })),
    ...Object.entries(needOil).map(([g, need]) => ({ kind: "oil", label: `${g} oil`, need, have: Math.round(haveOil(g) * 10) / 10, unit: "L" })),
  ].map((x) => ({ ...x, buy: Math.max(0, Math.round((x.need - x.have) * 10) / 10) })).sort((a, b) => b.buy - a.buy);
  return NextResponse.json({ parts, toBuy, bookingsCounted: upcoming.length });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { partId, delta, setTo, reorderAt } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(partId || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const [p] = await sbGet<Part>(`parts?select=id,on_hand&id=eq.${enc(partId)}`);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reorderAt != null) await sbPatch("parts", `id=eq.${p.id}`, { reorder_at: Math.max(0, Number(reorderAt) || 0) });
  const next = setTo != null ? Number(setTo) : Number(p.on_hand) + Number(delta || 0);
  if (!Number.isFinite(next) || next < 0) return NextResponse.json({ error: "Count can't go below 0" }, { status: 400 });
  if (next !== Number(p.on_hand)) {
    await sbPatch("parts", `id=eq.${p.id}`, { on_hand: Math.round(next * 100) / 100 });
    await sbInsert("stock_moves", { part_id: p.id, qty: Math.round((next - Number(p.on_hand)) * 100) / 100, reason: "adjust" });
  }
  return NextResponse.json({ ok: true, onHand: next, by: owner });
}

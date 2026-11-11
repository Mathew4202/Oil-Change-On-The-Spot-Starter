// GET → shelf + what the next 7 days need. POST {partId, delta | setTo} → manual count fix. POST {action:"add", ...} → add stock by hand.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { addonNeeds, sumNeeds, onShelf } from "@/lib/os/addon-needs";

export const dynamic = "force-dynamic";
type Part = { id: string; part_number: string; brand: string | null; description: string | null; category: string | null; on_hand: number; unit: string | null; oil_grade: string | null; reorder_at: number | null };

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const today = halifaxDate(new Date());
  const from = new Date().toISOString(), to = new Date(halifaxToDate(today, 0).getTime() + 8 * 86400000).toISOString();
  const [parts, upcoming] = await Promise.all([
    sbGet<Part>("parts?select=id,part_number,brand,description,category,on_hand,unit,oil_grade,reorder_at&order=category,part_number"),
    sbGet<{ cars: number; services: { job?: string; own?: string | null; addons?: string[] } | null; vehicles: { vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null;
      cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null } | null } | null }>(
      `bookings?select=cars,services,vehicles(vehicle_specs(oil_grade,capacity_l,oil_filter_part,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger))&status=in.(confirmed,requested,in_progress)&starts_at=gte.${from}&starts_at=lt.${to}`),
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
  // the add-ons they picked (cabin and air filters, wipers, battery, top-ups), for every kind of job
  const addons = sumNeeds(upcoming.map((b) => addonNeeds(b.services?.addons, b.vehicles?.vehicle_specs, b.cars)));
  // a filter linked as the same part (Parts Source vs NAPA) counts too
  const { loadLinks, onHandAll, eitherOf, sameParts } = await import("@/lib/os/part-alias");
  const links = await loadLinks();
  const have = (pn: string) => onHandAll(pn, links, parts);
  const haveOil = (g: string) => parts.filter((p) => p.unit === "L" && (p.oil_grade === g || p.oil_grade === g.replace(/^Euro /, ""))).reduce((t, p) => t + Number(p.on_hand), 0);
  const toBuy = [
    ...Object.entries(needFilters).map(([pn, need]) => ({ kind: "filter", label: `Oil filter ${eitherOf(pn, links)}`, need, have: have(pn), unit: "" })),
    ...Object.entries(needOil).map(([g, need]) => ({ kind: "oil", label: `${g} oil`, need, have: Math.round(haveOil(g) * 10) / 10, unit: "L" })),
    // can't tell what's on the shelf (no part # yet, a battery): counted as 0 so it shows up to sort out
    ...addons.map((x) => ({ kind: x.kind, label: x.part ? x.label.replace(x.part, eitherOf(x.part, links)) : x.label, need: x.qty, have: onShelf(x, parts, (pn) => sameParts(pn, links)) ?? 0, unit: x.unit ?? "" })),
  ].map((x) => ({ ...x, buy: Math.max(0, Math.round((x.need - x.have) * 10) / 10) })).sort((a, b) => b.buy - a.buy);
  return NextResponse.json({ parts, toBuy, bookingsCounted: upcoming.length });
}

const STOCK_CATS = ["oil_filter", "cabin_filter", "engine_filter", "wiper", "battery", "oil", "fluid", "washer_fluid", "coolant", "gloves", "shop_towels", "other"];
const SUPPLY: Record<string, { pn: string; unit: string; name: string }> = {
  gloves: { pn: "GLOVES", unit: "box", name: "Gloves" }, shop_towels: { pn: "SHOP-TOWELS", unit: "towels", name: "Shop towels" },
  washer_fluid: { pn: "WASHER-FLUID", unit: "L", name: "Washer fluid" }, coolant: { pn: "COOLANT", unit: "L", name: "Coolant" } };

/** Stock already on the shelf (or bought without a receipt): adds to the part if HQ knows it, otherwise adds the part. */
async function addStock(b: Record<string, unknown>) {
  const category = STOCK_CATS.includes(String(b.category)) ? String(b.category) : "other";
  const isOil = category === "oil";
  const grade = isOil ? String(b.oilGrade || "").toUpperCase().replace(/\s+/g, "").replace(/^(\d+)W(\d+)$/, "$1W-$2") : null;
  if (isOil && !/^\d+W-\d+$/.test(grade || "")) return { ok: false, error: "Type the oil grade, like 0W-20" };
  const sup = SUPPLY[category];
  const partNumber = sup ? sup.pn : isOil ? `OIL-${grade}` : String(b.partNumber || "").trim().toUpperCase().replace(/^PPF\s*/, "").replace(/\s+/g, " ").slice(0, 30);
  if (!partNumber) return { ok: false, error: "Type the part number" };
  const qty = Math.round(Number(b.qty) * 100) / 100;
  if (!(qty > 0 && qty <= (sup ? 20000 : 1000))) return { ok: false, error: isOil ? "How many litres?" : "How many?" };
  const cost = b.unitCost == null || b.unitCost === "" ? null : Math.round(Number(b.unitCost) * 100) / 100;
  let [p] = await sbGet<Part>(`parts?select=id,on_hand&part_number=eq.${enc(partNumber)}&order=on_hand.desc&limit=1`);
  if (!p) {
    const made = await sbInsert<Part>("parts", { part_number: partNumber, brand: sup ? "Shop" : String(b.brand || "").slice(0, 60) || (isOil ? null : "NAPA ProFormer"),
      description: sup ? sup.name : String(b.description || "").slice(0, 120) || (isOil ? `${grade} oil` : null), category, unit: isOil ? "L" : sup ? sup.unit : "each", oil_grade: grade, on_hand: 0 });
    if (!made.ok || !made.data) return { ok: false, error: "Couldn't add that part" };
    p = made.data;
  }
  const next = Math.round((Number(p.on_hand) + qty) * 100) / 100;
  await sbPatch("parts", `id=eq.${p.id}`, { on_hand: next });
  await sbInsert("stock_moves", { part_id: p.id, qty, reason: "added", ...(cost != null ? { unit_cost: cost } : {}) });
  // what it cost (after HST): the pricing and the profit estimates use it
  if (cost != null && cost > 0) {
    if (isOil) await sbInsert("oil_prices", { grade, cost_per_l: cost, supplier: String(b.brand || "on hand").slice(0, 60), updated_at: new Date().toISOString() }, { upsertOn: "grade" });
    else {
      const retail = Number(b.retail);   // the store's retail price, if they typed it: what we charge for it
      await sbInsert("part_quotes", { part_id: p.id, supplier: "other", our_cost: cost, ...(retail > 0 ? { retail: Math.round(retail * 100) / 100 } : {}) });
    }
  }
  return { ok: true, partNumber, onHand: next };
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "link") {   // "same as": another brand's number for a part our cars use
    const { linkPart } = await import("@/lib/os/part-alias");
    const r = await linkPart(String(body.from || ""), String(body.to || ""), owner);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (body.action === "add") { const r = await addStock(body); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
  const { partId, delta, setTo, reorderAt } = body;
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

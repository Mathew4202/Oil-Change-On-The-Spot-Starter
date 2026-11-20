// GET → shelf + what the next 7 days need. POST {partId, delta | setTo} → manual count fix. POST {action:"add", ...} → add stock by hand.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { addonNeeds, sumNeeds, onShelf } from "@/lib/os/addon-needs";

export const dynamic = "force-dynamic";
type Part = { id: string; part_number: string; brand: string | null; description: string | null; category: string | null; on_hand: number; unit: string | null; oil_grade: string | null; reorder_at: number | null;
  paid?: number | null; retail?: number | null; store?: string | null; fits?: string[] };


/** Bookings that start between two times (confirmed, requested, or in progress). */
function bookingsQuery(from: string, to: string) {
  return "bookings?select=cars,starts_at,quote_breakdown,services,vehicles(year,make,model,engine,vehicle_specs(oil_grade,capacity_l,oil_filter_part,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger))&status=in.(confirmed,requested,in_progress)&starts_at=gte." + from + "&starts_at=lt." + to + "&order=starts_at";
}

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const today = halifaxDate(new Date());
  const from = new Date().toISOString(), to = new Date(halifaxToDate(today, 0).getTime() + 8 * 86400000).toISOString();
  const [parts, upcoming] = await Promise.all([
    sbGet<Part>("parts?select=id,part_number,brand,description,category,on_hand,unit,oil_grade,reorder_at&order=category,part_number"),
    sbGet<{ cars: number; starts_at: string; quote_breakdown: { lines?: { label: string }[] } | null; services: { job?: string; own?: string | null; addons?: string[] } | null; vehicles: { year?: number | null; make?: string | null; model?: string | null; engine?: string | null; vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null;
      cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null } | null } | null }>(
      `${bookingsQuery(from, to)}`),
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
  // Next calendar month: what's already booked (oil by grade, filters and add-ons by part number)
  const [ty, tm] = today.split("-").map(Number);
  const monthStart = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
  const nextFrom = monthStart(tm === 12 ? ty + 1 : ty, tm === 12 ? 1 : tm + 1), nextTo = monthStart(tm >= 11 ? ty + 1 : ty, tm >= 11 ? (tm + 2) - 12 : tm + 2);
  const nextBookings = await sbGet<typeof upcoming[number]>(bookingsQuery(halifaxToDate(nextFrom, 0).toISOString(), halifaxToDate(nextTo, 0).toISOString())).catch(() => []);
  const bookedOil: Record<string, number> = {}, bookedPart: Record<string, number> = {};
  for (const b of nextBookings) {
    const s = b.vehicles?.vehicle_specs; const job = b.services?.job ?? "oil_change"; const own = b.services?.own;
    if (s && ["oil_change", "seasonal"].includes(job) && own !== "both") {
      const n = b.cars || 1;
      if (s.oil_filter_part && own !== "filter") bookedPart[s.oil_filter_part] = (bookedPart[s.oil_filter_part] || 0) + n;
      if (own !== "oil") { const g = s.oil_grade.replace(/^Euro /, ""); bookedOil[g] = (bookedOil[g] || 0) + Number(s.capacity_l) * n; }
    }
  }
  for (const x of sumNeeds(nextBookings.map((b) => addonNeeds(b.services?.addons, b.vehicles?.vehicle_specs, b.cars)))) {
    if (x.part && !x.key.endsWith(":?")) bookedPart[x.part] = (bookedPart[x.part] || 0) + Number(x.qty);
  }

  // part numbers we still need to look up: listed by car and day, never counted as covered
  const { missingParts, ownParts } = await import("@/lib/os/addon-needs");
  const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric" });
  const { loadFitRows } = await import("@/lib/os/part-alias");
  const { guessFilter, carsFor } = await import("@/lib/os/filter-guess");
  const fitRows = await loadFitRows();
  const missing = upcoming.flatMap((b) => {
    const car = { year: b.vehicles?.year ?? null, make: b.vehicles?.make ?? null, model: b.vehicles?.model ?? null, engine: b.vehicles?.engine ?? null };
    return missingParts({ job: b.services?.job, own: ownParts(b.services, b.quote_breakdown?.lines), spec: b.vehicles?.vehicle_specs as never,
      addons: b.services?.addons, car: [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "A car",
      guess: { oil: b.vehicles?.vehicle_specs?.oil_filter_part ? null : guessFilter(fitRows, car, "oil_filter_part"), cabin: guessFilter(fitRows, car, "cabin_filter_part"), air: guessFilter(fitRows, car, "air_filter_part") } })
      .map((m) => `${dayName(b.starts_at)}, ${m}`);
  });
  // the add-ons they picked (cabin and air filters, wipers, battery, top-ups), for every kind of job
  const addons = sumNeeds(upcoming.map((b) => addonNeeds(b.services?.addons, b.vehicles?.vehicle_specs, b.cars)));
  // a filter linked as the same part (Parts Source vs NAPA) counts too
  const { loadLinks, onHandAll, eitherOf, sameParts, loadStores } = await import("@/lib/os/part-alias");
  const { tagAll, tag, storeKey, storeName } = await import("@/lib/os/store-tag");
  const [links, stores] = await Promise.all([loadLinks(), loadStores()]);
  // a filter number off a spec we've never bought (and nothing linked to it has a store): those come from NAPA's lookup
  const either = (pn: string) => { const grp = sameParts(pn, links); const known = grp.some((p) => stores[storeKey(p)]); return grp.map((p, i) => tag(p, stores, !known && i === 0 ? "NAPA" : null)).join(" or "); };
  const have = (pn: string) => onHandAll(pn, links, parts);
  const haveOil = (g: string) => parts.filter((p) => p.unit === "L" && (p.oil_grade === g || p.oil_grade === g.replace(/^Euro /, ""))).reduce((t, p) => t + Number(p.on_hand), 0);
  const toBuy = [
    ...Object.entries(needFilters).map(([pn, need]) => ({ kind: "filter", label: `Oil filter ${either(pn)}`, need, have: have(pn), unit: "" })),
    ...Object.entries(needOil).map(([g, need]) => ({ kind: "oil", label: `${g} oil`, need, have: Math.round(haveOil(g) * 10) / 10, unit: "L" })),
    // can't tell what's on the shelf (no part # yet, a battery): counted as 0 so it shows up to sort out
    ...addons.filter((x) => !x.key.endsWith(":?")).map((x) => ({ kind: x.kind, label: x.part ? tagAll(x.label.replace(x.part, eitherOf(x.part, links)), stores) : x.label, need: x.qty, have: onShelf(x, parts, (pn) => sameParts(pn, links)) ?? 0, unit: x.unit ?? "" })),
  ].map((x) => ({ ...x, buy: Math.max(0, Math.round((x.need - x.have) * 10) / 10) })).sort((a, b) => b.buy - a.buy);
  // what we last paid and the store's retail price (add-on parts are charged at retail with tax + labour)
  const quotes = await sbGet<{ part_id: string; our_cost: number | null; retail: number | null; supplier: string | null }>("part_quotes?select=part_id,our_cost,retail,supplier&order=checked_at.desc&limit=3000").catch(() => []);
  for (const p of parts) {
    const qs = quotes.filter((q) => q.part_id === p.id);
    p.paid = qs.find((q) => q.our_cost != null)?.our_cost ?? null;
    p.retail = qs.find((q) => q.retail != null)?.retail ?? null;
    p.store = storeName(qs[0]?.supplier, p.brand) ?? stores[storeKey(p.part_number)] ?? null;
    // every car we know takes this filter (or one linked as the same part)
    const col = p.category === "oil_filter" ? "oil_filter_part" : p.category === "cabin_filter" ? "cabin_filter_part" : p.category === "engine_filter" ? "air_filter_part" : null;
    if (col) p.fits = carsFor(fitRows, sameParts(p.part_number, links), col);
  }
  // Restock for next month: what each part has used per month over the last 3 months (jobs take it off the shelf),
  // then what's short once the reorder level is kept. Oil is bought in boxes (4 x 5 L by default).
  const since = new Date(); since.setMonth(since.getMonth() - 3);
  const uses = await sbGet<{ part_id: string; qty: number; at: string }>(`stock_moves?select=part_id,qty,at&reason=eq.job&qty=lt.0&at=gte.${since.toISOString()}&limit=20000`).catch(() => []);
  const boxRule = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.oil_box_litres").catch(() => []);
  const boxL = Number(boxRule[0]?.value) || 20;
  const monthsSeen = new Set(uses.map((u) => u.at.slice(0, 7))).size;
  const months = Math.min(3, Math.max(1, monthsSeen));
  const used = new Map<string, number>();
  for (const u of uses) used.set(u.part_id, (used.get(u.part_id) ?? 0) + Math.abs(Number(u.qty)));
  const { normPart } = await import("@/lib/os/addon-needs");
  const restock = parts.flatMap((p) => {
    const perMonth = (used.get(p.id) ?? 0) / months;
    // next month needs what's booked for it, or what we've been using, whichever is more
    const group = sameParts(p.part_number, links).map(normPart);
    const booked = p.category === "oil"
      ? (bookedOil[(p.oil_grade ?? "").replace(/^Euro /, "")] ?? 0)
      : Object.entries(bookedPart).filter(([pn]) => group.includes(normPart(pn))).reduce((t, [, q]) => t + q, 0);
    const need = Math.max(perMonth, booked);
    if (need <= 0) return [];
    const short = need + Number(p.reorder_at ?? 0) - Number(p.on_hand);
    if (short <= 0) return [];
    const isOil = p.category === "oil";
    const buy = isOil ? Math.ceil(short / boxL) : Math.ceil(short);
    const unit = isOil ? "boxes" : p.unit === "L" ? "L" : p.unit === "towels" ? "towels" : p.unit === "box" ? "boxes" : "each";
    return [{ part: p.part_number, name: isOil ? `${p.oil_grade} oil` : (p.description || p.part_number), category: p.category ?? "other",
      buy, unit, perMonth: Math.round(need * 10) / 10, booked: Math.round(booked * 10) / 10, onHand: Math.round(Number(p.on_hand) * 10) / 10,
      boxSize: isOil ? boxL : null }];
  });
  return NextResponse.json({ parts, toBuy, missing, restock, restockMonths: months, nextMonthBookings: nextBookings.length, bookingsCounted: upcoming.length });
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
  if (body.action === "paid") {   // fix what we paid for one (a litre for oil), with HST, when a receipt read it wrong
    const v = Math.round(Number(body.paid) * 100) / 100;
    if (!(v > 0 && v < 5000)) return NextResponse.json({ ok: false, error: "Type what you paid for one, with tax" }, { status: 400 });
    const [p] = await sbGet<{ id: string; part_number: string; oil_grade: string | null }>(`parts?select=id,part_number,oil_grade&id=eq.${enc(String(body.partId))}`).catch(() => []);
    if (!p) return NextResponse.json({ ok: false, error: "Part not found" }, { status: 404 });
    await sbInsert("part_quotes", { part_id: p.id, supplier: "fixed in Stock", our_cost: v });
    if (p.part_number.startsWith("OIL-")) await sbInsert("oil_prices", { grade: p.oil_grade || p.part_number.slice(4), cost_per_l: v, supplier: "fixed in Stock", updated_at: new Date().toISOString() }, { upsertOn: "grade" });
    return NextResponse.json({ ok: true, paid: v });
  }
  if (body.action === "retail") {   // type the store's retail price for a part (before tax)
    const v = Math.round(Number(body.retail) * 100) / 100;
    if (!(v > 0 && v < 5000)) return NextResponse.json({ ok: false, error: "Type the retail price before tax, like 21.24" }, { status: 400 });
    const [last] = await sbGet<{ our_cost: number | null; supplier: string | null }>(`part_quotes?select=our_cost,supplier&part_id=eq.${enc(String(body.partId))}&order=checked_at.desc&limit=1`).catch(() => []);
    const r = await sbInsert("part_quotes", { part_id: String(body.partId), supplier: last?.supplier ?? "other", our_cost: last?.our_cost ?? null, retail: v });
    return NextResponse.json(r.ok ? { ok: true, retail: v } : { ok: false, error: "Couldn't save it" }, { status: r.ok ? 200 : 400 });
  }
  if (body.action === "fits") {   // a filter from a receipt: which car it fits
    const { fitsCar } = await import("@/lib/os/part-alias");
    const r = await fitsCar(String(body.part || ""), String(body.category || ""), String(body.years || ""), String(body.make || ""), String(body.model || ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
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

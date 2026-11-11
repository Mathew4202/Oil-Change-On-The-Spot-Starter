// Family discount: the price is just what the parts cost us (oil, oil filter, any add-on parts) plus $1 of supplies
// a car, no labour and no gas. HST goes on top like any sale. Owners tap "Family price" on the job card.
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { chargedAddons, normPart, ADDON_COST_DEFAULT } from "@/lib/os/addon-needs";

const r2 = (n: number) => Math.round(n * 100) / 100;
const NAMES: Record<string, string> = { cabin_filter: "Cabin filter (part)", engine_filter: "Engine air filter (part)", wipers: "Wiper blades (parts)", battery: "Battery (part)", washer_fluid: "Washer fluid", coolant: "Coolant" };

type Line = { label: string; amount: number };

type Spec = { oil_grade: string | null; capacity_l: number | null; oil_filter_part: string | null; cabin_filter_part?: string | null; air_filter_part?: string | null } | null | undefined;

/** The family price lines for a car: one line per part at what we last paid, before tax, plus supplies. */
export async function familyLines(x: { spec: Spec; job: string; own?: string | null; charged: Line[]; addons?: string[] | null; cars?: number | null; before?: string | null; excludeId?: string }) {
  const cars = Math.max(1, x.cars || 1), s = x.spec;
  const [prices, rulesRows, quotes] = await Promise.all([
    sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l&active=is.true").catch(() => []),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value").catch(() => []),
    sbGet<{ our_cost: number | null; parts: { part_number: string } | null }>("part_quotes?select=our_cost,parts!inner(part_number)&our_cost=not.is.null&order=checked_at.desc&limit=2000").catch(() => []),
  ]);
  const rr = Object.fromEntries(rulesRows.map((r) => [r.key, Number(r.value)]));
  const costOf = (pn: string | null | undefined) => { const q = pn ? quotes.find((y) => y.parts && normPart(y.parts.part_number) === normPart(pn)) : undefined; return q ? Number(q.our_cost) : null; };
  const lines: Line[] = [], missing: string[] = [];
  if (["oil_change", "seasonal"].includes(x.job) && !x.own) {
    const perL = s?.oil_grade ? prices.find((p) => p.grade === s.oil_grade)?.cost_per_l : undefined;
    if (!s?.oil_grade || !s.capacity_l) missing.push("the car's oil and litres");
    else if (perL == null) missing.push(`a price for ${s.oil_grade} oil`);
    else lines.push({ label: `Oil: ${r2(Number(s.capacity_l) * cars)} L ${s.oil_grade} at our cost`, amount: r2(Number(s.capacity_l) * Number(perL) * cars) });
    // a filter linked as the same part (Parts Source vs NAPA): the one we'd grab
    const { loadLinks, pickCost } = await import("@/lib/os/part-alias");
    const stock = await sbGet<{ part_number: string; on_hand: number }>("parts?select=part_number,on_hand&on_hand=gt.0").catch(() => []);
    // the filter left for this job after earlier bookings take theirs (NAPA first, then a linked one)
    let fc: number | null = null, usePart = s?.oil_filter_part ?? null;
    if (s?.oil_filter_part && x.before) {
      const { allocated } = await import("@/lib/os/part-alias");
      const a = await allocated(s.oil_filter_part, x.before, { excludeId: x.excludeId, cars }).catch(() => null);
      if (a?.inStock) { fc = costOf(a.part); if (fc != null) usePart = a.part; }
    }
    if (fc == null) fc = s?.oil_filter_part ? pickCost(s.oil_filter_part, await loadLinks(), costOf, (pn) => stock.filter((x) => normPart(x.part_number) === normPart(pn)).reduce((t, x) => t + Number(x.on_hand), 0)) : null;
    lines.push({ label: `Oil filter${usePart ? ` ${usePart}` : ""} at our cost${fc == null ? " (usual cost)" : ""}`, amount: r2((fc ?? rr.filter_estimate ?? 6.5) * cars) });
  }
  for (const { kind, times } of chargedAddons(x.charged, x.addons, cars)) {
    const pn = kind === "cabin_filter" ? s?.cabin_filter_part : kind === "engine_filter" ? s?.air_filter_part : null;
    const c = costOf(pn);
    lines.push({ label: `${NAMES[kind] ?? kind} at our cost${c == null ? " (usual cost)" : ""}`, amount: r2((c ?? rr[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times) });
  }
  lines.push({ label: "Supplies", amount: r2((rr.consumables ?? 1) * cars) });
  // what we paid includes HST, and we get that HST back on our return. So each part is its price before tax,
  // and HST goes on top: the family pays about what the parts cost us, and the tax is charged properly.
  const rate = Number(rr.hst_rate ?? 0.14);
  for (const l of lines) { l.amount = r2(l.amount / (1 + rate)); l.label = l.label.replace(" at our cost", " at our cost before tax"); }
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  return { lines, subtotal, hst: r2(subtotal * rate), total: r2(subtotal * (1 + rate)), missing };
}

/** What the family price would be for this booking. */
export async function familyPrice(id: string) {
  const [b] = await sbGet<{ status: string; starts_at: string; cars: number | null; services: { job?: string; own?: string | null; addons?: string[] } | null;
    quote_breakdown: { lines?: Line[]; family?: Line[] } | null; vehicles: { vehicle_specs: Spec } | null }>(
    `bookings?select=status,starts_at,cars,services,quote_breakdown,vehicles(vehicle_specs(oil_grade,capacity_l,oil_filter_part,cabin_filter_part,air_filter_part))&id=eq.${enc(id)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  if (b.status === "done" || b.status === "cancelled") return { ok: false as const, error: "This job is already finished or cancelled" };
  // the lines being charged (before any family price), so add-ons they dropped don't count
  const charged = b.quote_breakdown?.family ? b.quote_breakdown.family : (b.quote_breakdown?.lines ?? []);
  const f = await familyLines({ spec: b.vehicles?.vehicle_specs, job: b.services?.job ?? "oil_change", own: b.services?.own, charged, addons: b.services?.addons, cars: b.cars, before: b.starts_at, excludeId: id });
  return { ok: true as const, ...f, before: charged };
}

/** Save the family price on the booking (the regular lines are kept, so it can be undone). */
export async function setFamilyPrice(id: string, by: string, on = true, tell = false) {
  const r = await setFamilyPriceOnly(id, by, on);
  if (r.ok && tell && r.total !== r.oldTotal) {   // text them the new total (just the one number, tax in)
    const { tellNewPrice } = await import("@/lib/os/manage");
    await tellNewPrice(id, r.total, r.oldTotal ?? null, undefined, on ? "on" : "off").catch(() => null);
  }
  return r;
}

async function setFamilyPriceOnly(id: string, by: string, on: boolean) {
  const [b] = await sbGet<{ quote_breakdown: Record<string, unknown> & { lines?: Line[]; family?: Line[] } | null; needs_review: string[] | null }>(`bookings?select=quote_breakdown,needs_review&id=eq.${enc(id)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  const q = b.quote_breakdown ?? {};
  if (!on) {   // back to the regular price
    if (!q.family) return { ok: false as const, error: "It isn't on the family price" };
    const lines = q.family;
    const rate = 0.14, subtotal = r2(lines.reduce((t, l) => t + Number(l.amount), 0));
    const { family: _drop, familyBy: _by, ...rest } = q as Record<string, unknown>; void _drop; void _by;
    const bd = { ...rest, lines, subtotal, hst: r2(subtotal * rate), total: r2(subtotal * (1 + rate)) };
    if (!(await sbPatch("bookings", `id=eq.${enc(id)}`, { quoted_total: bd.total, quote_breakdown: bd }))) return { ok: false as const, error: "Couldn't save" };
    return { ok: true as const, total: bd.total, oldTotal: q.total != null ? Number(q.total) : null };
  }
  const p = await familyPrice(id);
  if (!p.ok) return p;
  if (p.missing.length) return { ok: false as const, error: `Add ${p.missing.join(" and ")} first (Edit details), so the oil is counted` };
  const who = by ? by.charAt(0).toUpperCase() + by.slice(1) : "HQ";
  const bd = { ...q, lines: p.lines, subtotal: p.subtotal, hst: p.hst, total: p.total, profit: 0, family: q.family ?? q.lines ?? [], familyBy: who };
  // it's set now: drop the "Family price not set" note from when it was booked
  const review = (b.needs_review ?? []).filter((n) => !n.startsWith("Family price not set"));
  if (!(await sbPatch("bookings", `id=eq.${enc(id)}`, { quoted_total: p.total, quote_breakdown: bd, ...(review.length !== (b.needs_review ?? []).length ? { needs_review: review } : {}) }))) return { ok: false as const, error: "Couldn't save the price" };
  return { ok: true as const, total: p.total, subtotal: p.subtotal, oldTotal: q.total != null ? Number(q.total) : null };
}

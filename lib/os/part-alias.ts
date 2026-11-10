// Same filter, different number: a Parts Source "Verified" filter that's the same as NAPA 27356 is linked once,
// then receipts and Stock count it as 27356 (stock, price, the calendar's Bring list, job costs).
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { normPart } from "@/lib/os/addon-needs";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The part number our cars use for this one (itself if it isn't linked). */
export async function partFor(pn: string) {
  const [a] = await sbGet<{ part_number: string }>(`part_aliases?select=part_number&alias=eq.${enc(normPart(pn))}&limit=1`).catch(() => []);
  return a?.part_number ?? pn;
}

/** Part numbers our cars use (oil, cabin and air filters), to spot a receipt filter no car knows. */
export async function carPartNumbers() {
  const specs = await sbGet<{ oil_filter_part: string | null; cabin_filter_part: string | null; air_filter_part: string | null }>(
    "vehicle_specs?select=oil_filter_part,cabin_filter_part,air_filter_part&limit=5000").catch(() => []);
  return new Set(specs.flatMap((s) => [s.oil_filter_part, s.cabin_filter_part, s.air_filter_part]).filter(Boolean).map((x) => normPart(x)));
}

/** Link "from" (the other brand's number) to "to" (the number our cars use) and move its stock and prices over. */
export async function linkPart(from: string, to: string, by: string) {
  const f = from.trim(), t = to.trim().toUpperCase();
  if (!f || !t) return { ok: false as const, error: "Type the part number our cars use, like 27356" };
  if (normPart(f) === normPart(t)) return { ok: false as const, error: "That's the same number" };
  const target = await partFor(t);   // linking to something that's itself linked: go to the end of the chain
  const r = await sbInsert("part_aliases", { alias: normPart(f), part_number: target, created_by: by }, { upsertOn: "alias" });
  if (!r.ok) return { ok: false as const, error: "Couldn't link it. Was the part_aliases SQL run in Supabase?" };
  // move what we have under the other number onto the one our cars use
  const [src] = await sbGet<{ id: string; on_hand: number; category: string | null; brand: string | null }>(`parts?select=id,on_hand,category,brand&part_number=eq.${enc(f)}&limit=1`);
  let moved = 0;
  if (src) {
    let [dst] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(target)}&order=on_hand.desc&limit=1`);
    if (!dst) {
      const made = await sbInsert<{ id: string; on_hand: number }>("parts", { part_number: target, brand: "NAPA", category: src.category, unit: "each", on_hand: 0 });
      if (!made.ok || !made.data) return { ok: false as const, error: "Linked, but couldn't move the stock" };
      dst = made.data;
    }
    moved = Number(src.on_hand);
    if (moved) {
      await sbPatch("parts", `id=eq.${dst.id}`, { on_hand: r2(Number(dst.on_hand) + moved) });
      await sbPatch("parts", `id=eq.${src.id}`, { on_hand: 0 });
      await sbInsert("stock_moves", { part_id: dst.id, qty: moved, reason: `same as ${f}` }).catch(() => null);
    }
    await sbPatch("part_quotes", `part_id=eq.${src.id}`, { part_id: dst.id });   // its prices now count for the cars' number
  }
  return { ok: true as const, to: target, moved };
}

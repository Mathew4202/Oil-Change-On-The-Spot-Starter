// Same filter, different number: a Parts Source "Verified" filter linked as the same as NAPA 27356 stays its own
// part in Stock, but anything looking for 27356 also counts it, and the Bring list says "27356 or <other #>",
// so whoever packs the van grabs either one.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { normPart } from "@/lib/os/addon-needs";

type Link = { alias: string; part_number: string };

export async function loadLinks(): Promise<Link[]> {
  return sbGet<Link>("part_aliases?select=alias,part_number&limit=2000").catch(() => []);
}

/** Every number that's the same part as pn, pn first (just [pn] if nothing is linked). */
export function sameParts(pn: string, links: Link[]): string[] {
  const n = normPart(pn);
  const main = links.find((l) => normPart(l.alias) === n)?.part_number ?? pn;
  const m = normPart(main);
  const all = [main, ...links.filter((l) => normPart(l.part_number) === m).map((l) => l.alias)];
  const out: string[] = [pn];
  for (const x of all) if (!out.some((y) => normPart(y) === normPart(x))) out.push(x);
  return out;
}

/** On hand for pn and every part linked to it. */
export function onHandAll(pn: string, links: Link[], parts: { part_number: string; on_hand: number }[]) {
  const set = new Set(sameParts(pn, links).map(normPart));
  return parts.filter((p) => set.has(normPart(p.part_number))).reduce((t, p) => t + Number(p.on_hand), 0);
}

/** "27356 or VF-3593" for the Bring list. */
export const eitherOf = (pn: string, links: Link[]) => sameParts(pn, links).join(" or ");

/** Part numbers our cars use (oil, cabin and air filters), to spot a receipt filter no car knows. */
export async function carPartNumbers() {
  const specs = await sbGet<{ oil_filter_part: string | null; cabin_filter_part: string | null; air_filter_part: string | null }>(
    "vehicle_specs?select=oil_filter_part,cabin_filter_part,air_filter_part&limit=5000").catch(() => []);
  return new Set(specs.flatMap((s) => [s.oil_filter_part, s.cabin_filter_part, s.air_filter_part]).filter(Boolean).map((x) => normPart(x)));
}

/** Link "from" (another brand's number) as the same part as "to" (the number our cars use). Stock stays separate. */
export async function linkPart(from: string, to: string, by: string) {
  const f = from.trim().toUpperCase(), t = to.trim().toUpperCase();
  if (!f || !t) return { ok: false as const, error: "Type the part number our cars use, like 27356" };
  if (normPart(f) === normPart(t)) return { ok: false as const, error: "That's the same number" };
  const links = await loadLinks();
  const main = links.find((l) => normPart(l.alias) === normPart(t))?.part_number ?? t;   // "to" is itself linked: use its main number
  const r = await sbInsert("part_aliases", { alias: f, part_number: main, created_by: by }, { upsertOn: "alias" });
  if (!r.ok) return { ok: false as const, error: "Couldn't link it. Was the part_aliases SQL run in Supabase?" };
  const [p] = await sbGet<{ on_hand: number }>(`parts?select=on_hand&part_number=eq.${enc(f)}&limit=1`).catch(() => []);
  return { ok: true as const, to: main, onHand: Number(p?.on_hand ?? 0) };
}

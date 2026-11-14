// Which store a part number is from (NAPA, PartSource, ...), so a job card never says "NAPA" in front of a PartSource number.
// Two numbers from different stores can still be the same part (linked in part_aliases); this only names where each one is from.

export const STORE_NAME: Record<string, string> = { napa: "NAPA", partsource: "PartSource", westpier: "West Pier", eastcoast: "East Coast" };

const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** A store's name from the receipt's supplier, or from the part's brand when there's no receipt. */
export function storeName(supplier?: string | null, brand?: string | null): string | null {
  if (supplier && STORE_NAME[supplier]) return STORE_NAME[supplier];
  const b = (brand || "").toLowerCase();
  if (/napa|proformer|silver ?guard/.test(b)) return "NAPA";
  if (/part ?s? ?source|verified/.test(b)) return "PartSource";
  if (/west ?pier/.test(b)) return "West Pier";
  if (/east ?coast/.test(b)) return "East Coast";
  return null;
}

/** "PartSource 9256" / "NAPA 27356". A number we've never bought: NAPA for oil filters off a spec (that's where those
 *  numbers come from), nothing for anything else. */
export function tag(pn: string, stores: Record<string, string> | null | undefined, fallback: string | null = null): string {
  const s = stores?.[norm(pn)] ?? fallback;
  return s ? `${s} ${pn}` : pn;
}

/** Same as tag, for every part number inside a label ("Cabin filter 24081 or 9256" → "Cabin filter NAPA 24081 or PartSource 9256"). */
export function tagAll(label: string, stores: Record<string, string> | null | undefined): string {
  if (!stores) return label;
  return label.replace(/\b([A-Z]{0,4}-?\d[\w-]{2,})\b/g, (m) => (stores[norm(m)] && !label.includes(`${stores[norm(m)]} ${m}`) ? `${stores[norm(m)]} ${m}` : m));
}

export const storeKey = norm;

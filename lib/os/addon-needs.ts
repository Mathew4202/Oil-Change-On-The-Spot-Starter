// The parts a booking's add-ons need (cabin filter, air filter, wipers, battery, top-ups), for the calendar's
// "Bring this day" line and Stock's "next 7 days". Pure (tested in __tests__/addon-needs.test.ts).

export type AddonSpec = { cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null } | null | undefined;
export type Need = { key: string; label: string; qty: number; part: string | null; kind: "cabin_filter" | "engine_filter" | "wiper" | "battery" | "fluid" };

/** What one booking's add-ons need. part = a part number to check against Stock (null = not on file yet). */
export function addonNeeds(addons: string[] | null | undefined, spec: AddonSpec, cars = 1): Need[] {
  const n = Math.max(1, cars || 1), out: Need[] = [];
  for (const a of addons ?? []) {
    if (a === "cabin_filter") {
      const pn = spec?.cabin_filter_part || null;
      out.push({ key: pn ? `cabin:${pn}` : "cabin:?", label: pn ? `Cabin filter ${pn}` : "Cabin filter (part # not on file)", qty: n, part: pn, kind: "cabin_filter" });
    } else if (a === "engine_filter") {
      const pn = spec?.air_filter_part || null;
      out.push({ key: pn ? `air:${pn}` : "air:?", label: pn ? `Engine air filter ${pn}` : "Engine air filter (part # not on file)", qty: n, part: pn, kind: "engine_filter" });
    } else if (a === "wipers") {
      const d = spec?.wiper_driver || null, p = spec?.wiper_passenger || null;
      if (d || p) for (const s of [d, p]) out.push(s ? { key: `wiper:${s}`, label: `Wiper blade ${s}"`, qty: n, part: null, kind: "wiper" }
        : { key: "wiper:?", label: "Wiper blade (size not on file)", qty: n, part: null, kind: "wiper" });
      else out.push({ key: "wiper:?", label: "Wiper blade (size not on file)", qty: 2 * n, part: null, kind: "wiper" });
    } else if (a === "battery") out.push({ key: "battery", label: "Battery (check the size)", qty: n, part: null, kind: "battery" });
    else if (a === "coolant") out.push({ key: "coolant", label: "Coolant", qty: n, part: null, kind: "fluid" });
    else if (a === "washer_fluid") out.push({ key: "washer", label: "Washer fluid", qty: n, part: null, kind: "fluid" });
  }
  return out;
}

/** Add up the needs of many bookings: one line per part (2 cars with the same cabin filter = 2 × that filter). */
export function sumNeeds(lists: Need[][]): Need[] {
  const by = new Map<string, Need>();
  for (const l of lists) for (const x of l) { const had = by.get(x.key); if (had) had.qty += x.qty; else by.set(x.key, { ...x }); }
  return Array.from(by.values());
}

/** A part number without spaces, dashes or a store prefix ("FIL 26195", "NAPA 2-6195" → "26195"), so the receipt's spelling matches the car's. */
export const normPart = (pn: string | null | undefined) =>
  (pn ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(NAPA|PPF|PFG|FIL|FILTER|WIX|NAP)/, "");

/** How many of a need are on the shelf: by part number for filters, by size for wipers, by name for the rest. */
export function onShelf(x: Need, parts: { part_number: string; description: string | null; category: string | null; on_hand: number }[]): number | null {
  const sum = (ps: typeof parts) => ps.reduce((t, p) => t + Number(p.on_hand), 0);
  if (x.part) return sum(parts.filter((p) => normPart(p.part_number) === normPart(x.part)));
  if (x.kind === "wiper") {
    const size = x.key.split(":")[1];
    if (size === "?") return null;
    return sum(parts.filter((p) => p.category === "wiper" && new RegExp(`(^|\\D)${size}(\\D|$)`).test(`${p.part_number} ${p.description ?? ""}`)));
  }
  if (x.kind === "fluid") {
    const re = x.key === "coolant" ? /coolant|antifreeze/i : /washer/i;
    const ps = parts.filter((p) => re.test(`${p.part_number} ${p.description ?? ""}`));
    return ps.length ? sum(ps) : null;
  }
  return null;   // battery, or a filter with no part number yet: can't tell
}

/** Which charged add-ons a price list has, and how many of each part (a booked add-on on a 2-car visit = 2). */
export const ADDON_NAMES: Record<string, RegExp> = { wipers: /wiper/i, cabin_filter: /cabin/i, engine_filter: /engine air/i, battery: /battery/i };
export function chargedAddons(lines: { label: string; amount: number }[], booked: string[] | null | undefined, cars = 1) {
  const out: { kind: string; times: number }[] = [];
  for (const k of Object.keys(ADDON_NAMES)) {
    const n = lines.filter((l) => ADDON_NAMES[k].test(l.label) && Number(l.amount) > 0).length;
    if (n) out.push({ kind: k, times: (booked ?? []).includes(k) && n === 1 ? Math.max(1, cars || 1) : n });
  }
  return out;
}
export const ADDON_COST_DEFAULT: Record<string, number> = { wipers: 22, cabin_filter: 22, engine_filter: 21, battery: 200 };

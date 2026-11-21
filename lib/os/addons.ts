// Which add-ons go with which service. Every service can take the small jobs (wipers, filters, battery, top-ups);
// a tire change only adds on to an oil change (the seasonal package and tire visits already include it).
// A tire rotation can be added to an oil change, and an oil change can be added to a rotation: that visit is stored
// as an oil change with a rotation add-on (see canonicalVisit), priced as the oil change plus the rotation, no discount.
// Pure, so the booking page, HQ and the server all use the same rule.
export const SMALL_JOBS = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid"];
export const addonsFor = (job: string | null | undefined) =>
  !job || job === "oil_change" ? ["tires", "rotation", ...SMALL_JOBS] : job === "rotation" ? ["oil_change", ...SMALL_JOBS] : SMALL_JOBS;
export const keepAddons = <T extends string>(job: string | null | undefined, addons: T[]): T[] => { const ok = addonsFor(job); return addons.filter((a) => ok.includes(a)); };
/** A rotation with an oil change is one oil-change visit with a rotation add-on. */
export function canonicalVisit<T extends string>(job: string, addons: T[]): { job: string; addons: T[] } {
  if (job === "rotation" && addons.includes("oil_change" as T)) return { job: "oil_change", addons: addons.map((a) => (a === "oil_change" ? "rotation" : a)) as T[] };
  return { job, addons };
}

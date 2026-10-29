// Which add-ons go with which service. Every service can take the small jobs (wipers, filters, battery, top-ups);
// a tire change only adds on to an oil change (the seasonal package and tire visits already include it).
// Pure, so the booking page, HQ and the server all use the same rule.
export const SMALL_JOBS = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid"];
export const addonsFor = (job: string | null | undefined) => (!job || job === "oil_change" ? ["tires", ...SMALL_JOBS] : SMALL_JOBS);
export const keepAddons = <T extends string>(job: string | null | undefined, addons: T[]): T[] => { const ok = addonsFor(job); return addons.filter((a) => ok.includes(a)); };

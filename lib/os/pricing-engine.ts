// OCOTS OS pricing engine.
// Pure function: give it the car's oil spec, today's costs and what the customer picked,
// and it returns the price with a full breakdown. No database or network calls in here,
// so it is easy to test and the same maths runs on the website and in the owner app.

export type VehicleClass = "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck" | "Sports Car";

export type OilSpec = {
  grade: string;          // "0W-20", "Euro 0W-30"
  capacityL: number;      // litres
  euro?: boolean;         // needs a European spec oil
  diesel?: boolean;       // diesel engine: heavy-duty diesel oil, big capacity, priced as cost + a set profit
};

export type Costs = {
  oilPerL: Record<string, number>;   // after-HST cost per litre by grade
  filterCost?: number | null;        // our cost for this car's oil filter
  consumables: number;               // $1 per oil change
};

export type Rules = {
  profitFloor: number;     // 45: never make less than this on an oil change
  bumpTo: number;          // price is raised to cost + this when under the floor (= the floor, so there's no price cliff between similar cars)
  roundTo: number;         // raised prices round up to a tidy number, e.g. 5
  hstRate: number;         // 0.14
  freeTravelKm: number;    // 30
};

export const DEFAULT_RULES: Rules = { profitFloor: 45, bumpTo: 45, roundTo: 5, hstRate: 0.14, freeTravelKm: 30 };

// Normal prices (same as the current website)
export const OIL_BASE: Record<VehicleClass, number> = {
  Sedan: 90, "SUV/Crossover": 110, "Large SUV": 120, Truck: 130, "Sports Car": 150,
};
export const EURO_BASE: Record<string, number> = {
  Volkswagen: 169.99, Audi: 169.99, Volvo: 169.99, "Mercedes-Benz": 169.99, BMW: 159.99, Porsche: 189.99,
  MINI: 159.99, FIAT: 159.99, "Alfa Romeo": 179.99, "Land Rover": 189.99, Jaguar: 189.99, Maserati: 199.99,   // only used if the oil price is missing
};

// Euro and sports cars: priced as our cost + a set profit (agreed Oct 24).
// Bigger profit than a normal car because these jobs take longer (cartridge filters, more oil, resets).
export const EURO_MARGIN: Record<VehicleClass, number> = {
  Sedan: 75, "SUV/Crossover": 85, "Large SUV": 95, Truck: 95, "Sports Car": 95,
};
export const SPORTS_MARGIN = 80;          // non-Euro sports cars (GR86, Mustang, WRX...)
// Diesels (Cummins, Duramax, Power Stroke, EcoDiesel, TDI): 7 to 13 L of diesel oil, bigger filters, longer drain.
// Priced as our cost + this profit, so a 12 L Cummins can never be charged like a 6 L gas truck.
export const DIESEL_MARGIN: Record<VehicleClass, number> = {
  Sedan: 70, "SUV/Crossover": 70, "Large SUV": 75, Truck: 75, "Sports Car": 75,
};
export const DIESEL_FILTER_GUESS = 20;    // used only when the filter price is not on file (flagged)
export const EURO_FILTER_GUESS = 15;      // used only when the filter price is not on file (flagged)

// Customer brings their own oil and/or filter (FAQ table)
const OWN_PARTS: Record<"both" | "oil" | "filter", Record<VehicleClass, number>> = {
  both:   { Sedan: 50, "SUV/Crossover": 60, "Large SUV": 70, Truck: 80, "Sports Car": 70 },
  oil:    { Sedan: 60, "SUV/Crossover": 70, "Large SUV": 80, Truck: 90, "Sports Car": 80 },
  filter: { Sedan: 80, "SUV/Crossover": 100, "Large SUV": 110, Truck: 120, "Sports Car": 110 },
};

// Seasonal tire change (tires already on rims), per vehicle size
export const TIRE_CHANGE: Record<VehicleClass, number> = {
  Sedan: 80, "SUV/Crossover": 90, "Large SUV": 100, Truck: 110, "Sports Car": 100,   // owners confirmed Oct 24: truck $110 (seasonal truck package $225); sports: low and riskier to lift
};

// Tire rotation (wheels moved around on the car): listed "starting at $90" in the business plan
export const ROTATION: Record<VehicleClass, number> = {
  Sedan: 90, "SUV/Crossover": 90, "Large SUV": 90, Truck: 90, "Sports Car": 90,
};

// Prices agreed Oct 24
export const SERVICE_PRICES = {
  diagnostic: 100,
  labourPerHour: 100,
  standaloneCallout: 50,      // battery, wipers or filters booked on their own
  batteryWithOilChange: 20,   // install fee when we are already there
  addonWipers: 15,            // with an oil change, plus parts
  addonFilter: 10,            // cabin or engine air filter with an oil change, plus parts
} as const;

export type Addon = { kind: "wipers" | "cabin_filter" | "engine_filter" | "battery" | "tires" | "coolant" | "washer_fluid"; partCost: number; partRetail?: number };
export const SEASONAL_DISCOUNT = 15;   // oil change + tire change on the same visit

export type QuoteInput = {
  vehicleClass: VehicleClass;
  make?: string;
  spec?: OilSpec | null;               // null = we don't know this car yet
  costs: Costs;
  rules?: Rules;
  ownParts?: "both" | "oil" | "filter" | null;
  addons?: Addon[];
  distanceKm?: number | null;
};

export type Line = { label: string; amount: number };
export type Quote = {
  lines: Line[];
  subtotal: number;
  hst: number;
  total: number;
  cost: number | null;          // our cost for the oil change part (null if unknown)
  profit: number | null;        // oil change profit after the floor check
  raised: boolean;              // true if the floor pushed the price up
  needsReview: string[];        // reasons an owner should look before confirming
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;
const to99 = (n: number) => Math.ceil((n + 0.01) / 5) * 5 - 0.01;   // 129.41 -> 129.99, 130 -> 134.99

export function travelFee(km: number | null | undefined, freeKm = 30): number {
  if (km == null || km < freeKm) return 0;
  // 30-39.9 +20, 40-49.9 +30, 50-59.9 +40, then +10 per extra 10 km
  return 20 + Math.floor((km - freeKm) / 10) * 10;
}

export function oilCostPerL(grade: string, table: Record<string, number>): number | null {
  if (table[grade] != null) return table[grade];
  // A Euro grade we have no price for is NOT priced as regular oil (that undercharged by ~$30 a job).
  // It comes back unknown, so the quote uses the safe Euro fallback price and is flagged for a look.
  if (/^euro/i.test(grade)) return null;
  return null;
}

/**
 * Which of our Westpier Euro oils a European car gets (Shawn's quote, Oct 21 2026):
 *   Euro 0W-30 = Pennzoil Platinum Euro LX: VW 504/507, MB 229.31/51/52, Porsche C30, Fiat. Cheapest, so used wherever it's approved.
 *   Euro 5W-30 = Pennzoil Platinum Euro L: BMW LL-04, MB 229.51 (BMW and MINI).
 *   Euro 0W-40 = Pennzoil Platinum Euro 0W-40: 40-weight specs (VW 502/505, MB 229.5, BMW LL-01, Porsche A40).
 *   Euro 0W-20 = Pennzoil Platinum Euro AV-L: newer 0W-20 specs (VW 508/509, MB 229.71, BMW LL-17FE, JLR, Volvo).
 */
export function euroOilKey(make: string, grade: string, oilSpec?: string | null): "Euro 0W-30" | "Euro 5W-30" | "Euro 0W-40" | "Euro 0W-20" {
  const t = `${grade} ${oilSpec ?? ""}`.toLowerCase();
  if (/\b0w-?20\b|\b0w-?16\b|\b0w-?12\b|508|509|229\.7|ll-?17|ll-?19|5005|rbs0-2ae/.test(t)) return "Euro 0W-20";
  const forty = /\b[05]w-?40\b|\b502\b|\b505\b|229\.5(?!\d)|229\.3(?!\d)|\ba40\b|ll-?01|ll-?98/.test(t);
  if (/^(bmw|mini)$/i.test(make)) return forty ? "Euro 0W-40" : "Euro 5W-30";
  return forty ? "Euro 0W-40" : "Euro 0W-30";
}

export function quoteOilChange(input: QuoteInput): Quote {
  const rules = input.rules ?? DEFAULT_RULES;
  const cls = input.vehicleClass;
  const lines: Line[] = [];
  const needsReview: string[] = [];
  let cost: number | null = null;
  let profit: number | null = null;
  let raised = false;

  const euroPrice = input.make ? EURO_BASE[input.make] : undefined;
  let price: number;

  const diesel = !!input.spec?.diesel && !euroPrice;
  const setMargin = () => (euroPrice ? EURO_MARGIN[cls] : diesel ? DIESEL_MARGIN[cls] : SPORTS_MARGIN);
  const filterGuess = () => (euroPrice ? EURO_FILTER_GUESS : diesel ? DIESEL_FILTER_GUESS : 10);
  // a diesel oil we have no price for: use the dearest diesel oil we know (never undercharge), and flag it
  const perLFor = (grade: string) => oilCostPerL(grade, input.costs.oilPerL)
    ?? (diesel ? (Math.max(0, ...Object.entries(input.costs.oilPerL).filter(([k]) => /^diesel/i.test(k)).map(([, v]) => v)) || null) : null);

  if (input.ownParts && (euroPrice || cls === "Sports Car" || diesel)) {
    // Euro / sports car, customer brings parts: we keep the same profit as a full job (riskier, slower work),
    // they only skip paying for what they brought. Oil + filter brought = the profit alone, e.g. BMW sedan $75.
    const margin = setMargin();
    const who = input.ownParts === "both" ? "oil and filter" : input.ownParts;
    let ours = 0;                          // what we still supply, at our cost
    let known = true;
    if (input.ownParts === "oil") {        // we bring the filter
      let filter = input.costs.filterCost;
      if (filter == null) { filter = filterGuess(); needsReview.push("Filter price not on file (estimated)"); }
      ours = filter;
    } else if (input.ownParts === "filter") {   // we bring the oil
      const perL = input.spec ? perLFor(input.spec.grade) : null;
      if (perL == null || !input.spec) { known = false; needsReview.push(input.spec ? `No oil price on file for ${input.spec.grade}` : "Oil type and capacity not on file for this car"); }
      else ours = input.spec.capacityL * perL;
    }
    cost = r2(ours + input.costs.consumables);
    price = !known ? (euroPrice ?? OIL_BASE[cls]) : input.ownParts === "both" ? margin : r2(to99(cost + margin));
    lines.push({ label: `Oil change labour (you supply ${who})`, amount: price });
  } else if (input.ownParts) {
    price = OWN_PARTS[input.ownParts][cls];
    lines.push({ label: `Oil change labour (you supply ${input.ownParts === "both" ? "oil and filter" : input.ownParts})`, amount: price });
    if (input.ownParts === "filter" && input.spec) {
      const perL = oilCostPerL(input.spec.grade, input.costs.oilPerL);
      if (perL != null) cost = r2(input.spec.capacityL * perL + input.costs.consumables);
    }
  } else if ((euroPrice || cls === "Sports Car" || diesel) && input.spec) {
    // Euro / sports / diesel: cost + set profit
    const margin = setMargin();
    const perL = perLFor(input.spec.grade);
    if (diesel && oilCostPerL(input.spec.grade, input.costs.oilPerL) == null) needsReview.push(`No price on file for ${input.spec.grade} diesel oil (priced at our dearest diesel oil)`);
    let filter = input.costs.filterCost;
    if (filter == null) { filter = filterGuess(); needsReview.push("Filter price not on file (estimated)"); }
    if (perL == null) {
      needsReview.push(`No oil price on file for ${input.spec.grade}`);
      price = euroPrice ?? OIL_BASE[cls];
    } else {
      cost = r2(input.spec.capacityL * perL + filter + input.costs.consumables);
      price = r2(to99(cost + margin));
    }
    lines.push({ label: diesel ? `Diesel oil change (${input.spec.grade.replace(/^Diesel /i, "")} diesel oil, ${input.spec.capacityL} L)` : `Full synthetic oil change (${input.spec.grade}, ${input.spec.capacityL} L)`, amount: price });
  } else {
    price = euroPrice ?? OIL_BASE[cls];
    if (!input.spec) {
      needsReview.push("Oil type and capacity not on file for this car");
    } else {
      const perL = oilCostPerL(input.spec.grade, input.costs.oilPerL);
      if (perL == null) needsReview.push(`No oil price on file for ${input.spec.grade}`);
      if (input.costs.filterCost == null) needsReview.push("Filter price not on file");
      if (perL != null) {
        cost = r2(input.spec.capacityL * perL + (input.costs.filterCost ?? 0) + input.costs.consumables);
        if (price - cost < rules.profitFloor) {
          price = ceilTo(cost + rules.bumpTo, rules.roundTo);
          raised = true;
        }
      }
    }
    lines.push({ label: `Full synthetic oil change${input.spec ? ` (${input.spec.grade}, ${input.spec.capacityL} L)` : ""}`, amount: price });
  }
  if (cost != null) profit = r2(price - cost);

  // Labour we earn on add-ons counts toward profit (part prices and top-ups don't, until their cost is known)
  let addonLabour = 0;
  for (const a of input.addons ?? []) {
    addonLabour += a.kind === "tires" ? TIRE_CHANGE[cls] : a.kind === "wipers" ? SERVICE_PRICES.addonWipers
      : a.kind === "battery" ? SERVICE_PRICES.batteryWithOilChange : a.kind === "cabin_filter" || a.kind === "engine_filter" ? SERVICE_PRICES.addonFilter : 0;
    const retail = a.partRetail ?? a.partCost;
    if (a.kind === "wipers") lines.push({ label: "Wiper blades", amount: r2(SERVICE_PRICES.addonWipers + retail) });
    if (a.kind === "cabin_filter") lines.push({ label: "Cabin air filter", amount: r2(SERVICE_PRICES.addonFilter + retail) });
    if (a.kind === "engine_filter") lines.push({ label: "Engine air filter", amount: r2(SERVICE_PRICES.addonFilter + retail) });
    if (a.kind === "battery") lines.push({ label: "Battery", amount: r2(SERVICE_PRICES.batteryWithOilChange + retail) });
    if (a.kind === "tires") lines.push({ label: "Tire change (on rims)", amount: TIRE_CHANGE[cls] });
    if (a.kind === "coolant") lines.push({ label: "Coolant top-up", amount: r2(retail) });
    if (a.kind === "washer_fluid") lines.push({ label: "Washer fluid top-up", amount: r2(retail) });
  }

  const travel = travelFee(input.distanceKm, rules.freeTravelKm);
  if (travel) lines.push({ label: `Travel (${Math.round(input.distanceKm!)} km)`, amount: travel });
  if (profit != null) profit = r2(profit + addonLabour);   // travel fee covers gas, so it is not counted

  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const hst = r2(subtotal * rules.hstRate);
  return { lines, subtotal, hst, total: r2(subtotal + hst), cost, profit, raised, needsReview };
}

// Standalone jobs (no oil change)
export function quoteStandalone(opts: {
  kind: "diagnostic" | "labour" | "battery" | "wipers" | "cabin_filter" | "engine_filter";
  hours?: number;
  partRetail?: number;
  distanceKm?: number | null;
  rules?: Rules;
}): Quote {
  const rules = opts.rules ?? DEFAULT_RULES;
  const lines: Line[] = [];
  const names = { battery: "Battery", wipers: "Wiper blades", cabin_filter: "Cabin air filter", engine_filter: "Engine air filter" } as const;
  if (opts.kind === "diagnostic") lines.push({ label: "Diagnostic", amount: SERVICE_PRICES.diagnostic });
  else if (opts.kind === "labour") lines.push({ label: `Repair labour (${opts.hours ?? 1} h)`, amount: r2(SERVICE_PRICES.labourPerHour * (opts.hours ?? 1)) });
  else {
    lines.push({ label: "Mobile service call", amount: SERVICE_PRICES.standaloneCallout });
    if (opts.partRetail != null) lines.push({ label: names[opts.kind], amount: r2(opts.partRetail) });
  }
  const travel = travelFee(opts.distanceKm, rules.freeTravelKm);
  if (travel) lines.push({ label: `Travel (${Math.round(opts.distanceKm!)} km)`, amount: travel });
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const hst = r2(subtotal * rules.hstRate);
  return { lines, subtotal, hst, total: r2(subtotal + hst), cost: null, profit: null, raised: false,
    needsReview: opts.partRetail == null && !["diagnostic", "labour"].includes(opts.kind) ? ["Part price not on file"] : [] };
}

export type JobType = "oil_change" | "seasonal" | "parts" | "diagnostic" | "tires" | "rotation";
export const JOB_NAMES: Record<JobType, string> = { oil_change: "Oil change", seasonal: "Seasonal package", parts: "Parts visit (no oil change)", diagnostic: "Diagnostic", tires: "Tire change", rotation: "Tire rotation" };
const PART_NAMES = { battery: "Battery", wipers: "Wiper blades", cabin_filter: "Cabin air filter", engine_filter: "Engine air filter", tires: "Tire change (on rims)", coolant: "Coolant top-up", washer_fluid: "Washer fluid top-up" } as const;

/** A visit with no oil change: one $50 call-out for any number of parts, or a $100 diagnostic. */
export function quoteVisit(opts: { job: Exclude<JobType, "oil_change" | "seasonal">; items?: Addon[]; distanceKm?: number | null; rules?: Rules; vehicleClass?: VehicleClass }): Quote {
  const rules = opts.rules ?? DEFAULT_RULES;
  const lines: Line[] = [];
  const needsReview: string[] = [];
  if (opts.job === "diagnostic") {
    lines.push({ label: "Diagnostic", amount: SERVICE_PRICES.diagnostic });
  } else if (opts.job === "tires") {
    lines.push({ label: "Tire change (on rims)", amount: TIRE_CHANGE[opts.vehicleClass ?? "Sedan"] });
  } else if (opts.job === "rotation") {
    lines.push({ label: "Tire rotation", amount: ROTATION[opts.vehicleClass ?? "Sedan"] });
  }
  // Add-ons on a tire, rotation or diagnostic visit: same price as with an oil change (we're already there)
  let addonLabour = 0;
  if (opts.job !== "parts") {
    for (const a of opts.items ?? []) {
      if (a.kind === "tires") continue;
      const retail = a.partRetail ?? a.partCost;
      const labour = a.kind === "wipers" ? SERVICE_PRICES.addonWipers : a.kind === "battery" ? SERVICE_PRICES.batteryWithOilChange
        : a.kind === "cabin_filter" || a.kind === "engine_filter" ? SERVICE_PRICES.addonFilter : 0;
      addonLabour += labour;
      if (!retail && a.kind !== "coolant" && a.kind !== "washer_fluid") needsReview.push(`${PART_NAMES[a.kind]} price to confirm`);
      lines.push({ label: PART_NAMES[a.kind], amount: r2(labour + (retail || 0)) });
    }
  } else {
    lines.push({ label: "Mobile service call", amount: SERVICE_PRICES.standaloneCallout });
    for (const a of opts.items ?? []) {
      const price = a.partRetail ?? a.partCost;
      if (!price) needsReview.push(`${PART_NAMES[a.kind]} price to confirm`);
      lines.push({ label: PART_NAMES[a.kind], amount: r2(price || 0) });
    }
  }
  const travel = travelFee(opts.distanceKm, rules.freeTravelKm);
  if (travel) lines.push({ label: `Travel (${Math.round(opts.distanceKm!)} km)`, amount: travel });
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  const hst = r2(subtotal * rules.hstRate);
  // Profit (on the safe side): the visit fee itself; any margin on parts is extra
  const fee = opts.job === "diagnostic" ? SERVICE_PRICES.diagnostic : opts.job === "tires" ? TIRE_CHANGE[opts.vehicleClass ?? "Sedan"]
    : opts.job === "rotation" ? ROTATION[opts.vehicleClass ?? "Sedan"] : SERVICE_PRICES.standaloneCallout;
  const partsTotal = r2(lines.filter((l) => !/^Travel|^Mobile service call|^Diagnostic|^Tire change|^Tire rotation/.test(l.label)).reduce((t, l) => t + l.amount, 0) - addonLabour);
  return { lines, subtotal, hst, total: r2(subtotal + hst), cost: partsTotal, profit: r2(fee + addonLabour), raised: false, needsReview };
}

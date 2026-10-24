// OCOTS OS pricing engine.
// Pure function: give it the car's oil spec, today's costs and what the customer picked,
// and it returns the price with a full breakdown. No database or network calls in here,
// so it is easy to test and the same maths runs on the website and in the owner app.

export type VehicleClass = "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck" | "Sports Car";

export type OilSpec = {
  grade: string;          // "0W-20", "Euro 0W-30"
  capacityL: number;      // litres
  euro?: boolean;         // needs a European spec oil
};

export type Costs = {
  oilPerL: Record<string, number>;   // after-HST cost per litre by grade
  filterCost?: number | null;        // our cost for this car's oil filter
  consumables: number;               // $1 per oil change
};

export type Rules = {
  profitFloor: number;     // 45: never make less than this on an oil change
  bumpTo: number;          // price is raised to cost + this when under the floor
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
};

// Euro and sports cars: priced as our cost + a set profit (agreed Oct 24).
// Bigger profit than a normal car because these jobs take longer (cartridge filters, more oil, resets).
export const EURO_MARGIN: Record<VehicleClass, number> = {
  Sedan: 75, "SUV/Crossover": 85, "Large SUV": 95, Truck: 95, "Sports Car": 95,
};
export const SPORTS_MARGIN = 80;          // non-Euro sports cars (GR86, Mustang, WRX...)
export const EURO_FILTER_GUESS = 15;      // used only when the filter price is not on file (flagged)

// Customer brings their own oil and/or filter (FAQ table)
const OWN_PARTS: Record<"both" | "oil" | "filter", Record<VehicleClass, number>> = {
  both:   { Sedan: 50, "SUV/Crossover": 60, "Large SUV": 70, Truck: 80, "Sports Car": 70 },
  oil:    { Sedan: 60, "SUV/Crossover": 70, "Large SUV": 80, Truck: 90, "Sports Car": 80 },
  filter: { Sedan: 80, "SUV/Crossover": 100, "Large SUV": 110, Truck: 120, "Sports Car": 110 },
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

export type Addon = { kind: "wipers" | "cabin_filter" | "engine_filter" | "battery"; partCost: number; partRetail?: number };

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
  const plain = grade.replace(/^Euro\s+/i, "");
  // a Euro grade we don't stock exactly falls back to the same grade, then to our Euro 0W-30
  if (/^euro/i.test(grade)) return table[plain] ?? table["Euro 0W-30"] ?? null;
  return table[plain] ?? null;
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

  if (input.ownParts) {
    price = OWN_PARTS[input.ownParts][cls];
    lines.push({ label: `Oil change labour (you supply ${input.ownParts === "both" ? "oil and filter" : input.ownParts})`, amount: price });
    if (input.ownParts === "filter" && input.spec) {
      const perL = oilCostPerL(input.spec.grade, input.costs.oilPerL);
      if (perL != null) cost = r2(input.spec.capacityL * perL + input.costs.consumables);
    }
  } else if ((euroPrice || cls === "Sports Car") && input.spec) {
    // Euro / sports: cost + set profit
    const margin = euroPrice ? EURO_MARGIN[cls] : SPORTS_MARGIN;
    const perL = oilCostPerL(input.spec.grade, input.costs.oilPerL);
    let filter = input.costs.filterCost;
    if (filter == null) { filter = euroPrice ? EURO_FILTER_GUESS : 10; needsReview.push("Filter price not on file (estimated)"); }
    if (perL == null) {
      needsReview.push(`No oil price on file for ${input.spec.grade}`);
      price = euroPrice ?? OIL_BASE[cls];
    } else {
      cost = r2(input.spec.capacityL * perL + filter + input.costs.consumables);
      price = r2(to99(cost + margin));
    }
    lines.push({ label: `Full synthetic oil change (${input.spec.grade}, ${input.spec.capacityL} L)`, amount: price });
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

  for (const a of input.addons ?? []) {
    const retail = a.partRetail ?? a.partCost;
    if (a.kind === "wipers") lines.push({ label: "Wiper blades", amount: r2(SERVICE_PRICES.addonWipers + retail) });
    if (a.kind === "cabin_filter") lines.push({ label: "Cabin air filter", amount: r2(SERVICE_PRICES.addonFilter + retail) });
    if (a.kind === "engine_filter") lines.push({ label: "Engine air filter", amount: r2(SERVICE_PRICES.addonFilter + retail) });
    if (a.kind === "battery") lines.push({ label: "Battery", amount: r2(SERVICE_PRICES.batteryWithOilChange + retail) });
  }

  const travel = travelFee(input.distanceKm, rules.freeTravelKm);
  if (travel) lines.push({ label: `Travel (${Math.round(input.distanceKm!)} km)`, amount: travel });

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

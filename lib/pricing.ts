// lib/pricing.ts
export type VehicleClass = "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck" | "Sports Car";

export const BASE_CLASS_PRICE: Record<VehicleClass, number> = {
  "Sedan": 80,
  "SUV/Crossover": 90,
  "Large SUV": 100,
  "Truck": 110,
  "Sports Car": 110, // a bit higher than Sedan, below Euro overrides
};

export const EURO_BRAND_PRICE: Record<string, number> = {
  "Volkswagen": 120,
  "Audi": 130,
  "Volvo": 130,
  "Mercedes-Benz": 140,
  "BMW": 140,
  "Porsche": 170,
};

export function computeQuote(opts: { make: string; vehicleClass: VehicleClass }) {
  const { make, vehicleClass } = opts;
  const normalized = normalizeMake(make);
  const base = EURO_BRAND_PRICE[normalized] ?? BASE_CLASS_PRICE[vehicleClass];
  return { make: normalized, vehicleClass, base };
}

function normalizeMake(m: string) {
  const map: Record<string,string> = {
    volkswagen:"Volkswagen", audi:"Audi", volvo:"Volvo",
    "mercedes-benz":"Mercedes-Benz", mercedes:"Mercedes-Benz",
    bmw:"BMW", porsche:"Porsche"
  };
  const k = m.trim().toLowerCase();
  return map[k] ?? capitalize(m.trim());
}
function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

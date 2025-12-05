// data/vehicleClass.ts
import { type VehicleClass } from "@/lib/pricing";

/**
 * Best-effort guess of vehicle class from the model name.
 * Returns "" if we cannot guess.
 */
export function detectClassFromModel(rawModel: string | null | undefined): VehicleClass | "" {
  if (!rawModel) return "";
  const model = rawModel.toLowerCase().trim();
  if (!model) return "";

 // 1. Hard overrides for known tricky models
// You add more entries here as needed.
if (model.includes("santa fe xl")) {
// 3-row Santa Fe XL
return "Large SUV";
}

if (model.includes("santa fe")) {
// covers "santa fe", "santa fe sport", typos etc.
return "SUV/Crossover";
}

if (model.includes("commander")) {
// Jeep Commander
return "Large SUV";
}

  // 2. Sports cars / performance
  const sportsKeywords = [
    "gr86",
    "86",
    "supra",
    "brz",
    "mustang",
    "camaro",
    "corvette",
    "challenger",
    "charger",
    "m3",
    "m4",
    "amg",
    "srt",
    "sti",
    "type r",
    "gti",
    "fr-s",
    "frs",
    "wrx",
  ];
  if (sportsKeywords.some(k => model.includes(k))) {
    return "Sports Car";
  }

  // 3. Trucks
  const truckKeywords = [
    "f-150",
    "f150",
    "f-250",
    "f250",
    "f-350",
    "f350",
    "silverado",
    "sierra",
    "ram",
    "tundra",
    "tacoma",
    "colorado",
    "ranger",
    "canyon",
  ];
  if (truckKeywords.some(k => model.includes(k))) {
    return "Truck";
  }

  // 4. Large SUVs (3-row / XL)
 const largeSuvKeywords = [
"suburban",
"expedition",
"yukon",
"yukon xl",
"escalade",
"palisade",
"telluride",
"atlas",
"highlander",
"sequoia",
"pilot",
"ascent",
"traverse",
"enclave",
"armada",
"pathfinder",
"commander",
"xl",
"max",
];
  if (largeSuvKeywords.some(k => model.includes(k))) {
    return "Large SUV";
  }

  // 5. Normal SUVs / crossovers
  const suvKeywords = [
    "suv",
    "crossover",
    "sportage",
    "tucson",
    "rav4",
    "cr-v",
    "crv",
    "rogue",
    "escape",
    "edge",
    "equinox",
    "cx-5",
    "cx5",
    "cx-50",
    "cx50",
    "cx-30",
    "cx30",
    "seltos",
    "kona",
    "sante fe", // catch misspelling
    "santa fe", // safety
    "venue",
    "venue",
    "sorento",
    "forester",
    "outback",
    "cherokee",
    "compass",
    "grand cherokee",
    "encore",
    "terrain",
    "murano",
    "kicks",
    "hr-v",
    "hrv",
    "venza",
    "trailblazer",
    "blazer",
    "gv70",
    "gv80",
  ];
  if (suvKeywords.some(k => model.includes(k))) {
    return "SUV/Crossover";
  }

  // 6. Default to Sedan if it looks like a car model
  const sedanHints = [
    "sedan",
    "civic",
    "corolla",
    "elantra",
    "sonata",
    "camry",
    "accord",
    "malibu",
    "impala",
    "jetta",
    "passat",
    "a4",
    "a3",
    "a6",
    "3 series",
    "5 series",
    "altima",
    "maxima",
    "mazda3",
    "mazda 3",
    "mazda6",
    "mazda 6",
    "versa",
    "yaris",
    "sentra",
    "focus",
    "fusion",
    "legacy",
    "impreza",
    "c-class",
    "e-class",
    "s60",
    "s80",
  ];
  if (sedanHints.some(k => model.includes(k))) {
    return "Sedan";
  }

  // 7. Fallback: return "" so UI stays as "—"
  return "";
}

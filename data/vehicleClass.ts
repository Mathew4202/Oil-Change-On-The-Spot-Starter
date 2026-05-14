// data/vehicleClass.ts
import { type VehicleClass } from "@/lib/pricing";

export function detectClassFromModel(rawModel: string | null | undefined): VehicleClass | "" {
  if (!rawModel) return "";
  const model = rawModel.toLowerCase().trim();
  if (!model) return "";

  // Hard overrides
  if (model.includes("santa fe xl")) return "Large SUV";
  if (model.includes("santa fe")) return "SUV/Crossover";
  if (model.includes("commander")) return "Large SUV";

  // Fixes requested
  if (model.includes("acadia")) return "Large SUV";
  if (model.includes("sienna")) return "Large SUV";

  // Sports cars / performance
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
    "srt",
    "sti",
    "type r",
    "gti",
    "fr-s",
    "frs",
    "wrx",
  ];
  if (sportsKeywords.some((k) => model.includes(k))) return "Sports Car";

  // Trucks
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
  if (truckKeywords.some((k) => model.includes(k))) return "Truck";

  // Large SUVs (3-row / XL)
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
    "acadia",
    "sienna",
    "xl",
    "max",
    "4runner",
  ];
  if (largeSuvKeywords.some((k) => model.includes(k))) return "Large SUV";

  // Normal SUVs / crossovers
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
    "sante fe",
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
  if (suvKeywords.some((k) => model.includes(k))) return "SUV/Crossover";

  // Sedans
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
    "altima",
    "maxima",
    "versa",
    "yaris",
    "sentra",
    "focus",
    "fusion",
    "legacy",
    "impreza",
  ];
  if (sedanHints.some((k) => model.includes(k))) return "Sedan";

  return "";
}
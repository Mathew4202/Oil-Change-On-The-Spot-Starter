import { type VehicleClass } from "@/lib/pricing";

export function detectClassFromModel(rawModel: string | null | undefined): VehicleClass | "" {
  if (!rawModel) return "";
  const model = rawModel.toLowerCase().trim();
  if (!model) return "";

  if (model.includes("santa fe xl")) {
    return "Large SUV";
  }

  if (model.includes("santa fe")) {
    return "SUV/Crossover";
  }

  if (model.includes("commander")) {
    return "Large SUV";
  }

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
  if (sportsKeywords.some((k) => model.includes(k))) {
    return "Sports Car";
  }

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
  if (truckKeywords.some((k) => model.includes(k))) {
    return "Truck";
  }

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
  if (largeSuvKeywords.some((k) => model.includes(k))) {
    return "Large SUV";
  }

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
    "santa fe",
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
  if (suvKeywords.some((k) => model.includes(k))) {
    return "SUV/Crossover";
  }

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
  if (sedanHints.some((k) => model.includes(k))) {
    return "Sedan";
  }

  return "";
}
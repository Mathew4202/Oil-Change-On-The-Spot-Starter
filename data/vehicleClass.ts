// data/vehicleClass.ts
// Which size/price group a car falls in, from its model (and make for a few brands).
// Matching is by whole words only: "Maxima" is not "max", "Camry XLE" is not "xl", "Versa" is not "rs".
import type { VehicleClass } from "@/lib/pricing";

const has = (text: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(text);
const any = (text: string, words: string[]) => words.some((w) => has(text, w));

// Low, fast, often harder to lift and easier to scratch: priced higher
const SPORTS = [
  "gr86", "86", "supra", "brz", "fr-s", "frs", "mustang", "camaro", "corvette", "challenger", "charger", "viper", "srt", "hellcat",
  "sti", "wrx", "type r", "civic si", "si", "gti", "golf r", "veloster n", "elantra n", "kona n", "miata", "mx-5", "mx5",
  "350z", "370z", "z", "nismo", "gt-r", "gtr", "genesis coupe", "s2000", "nsx", "rc f", "is f", "lc", "stinger",
  "m2", "m3", "m4", "m5", "m6", "m8", "z4", "amg", "sl", "slk", "slc", "amg gt", "rs3", "rs4", "rs5", "rs6", "rs7", "tt", "tts", "r8",
  "911", "cayman", "boxster", "718", "gt350", "gt500", "boss 302", "zl1", "rx-7", "rx-8", "rx8", "m340i", "s4", "s5",
];
const TRUCKS = ["f-150", "f150", "f-250", "f250", "f-350", "f350", "silverado", "sierra", "ram", "1500", "2500", "3500", "tundra", "tacoma",
  "colorado", "ranger", "canyon", "titan", "frontier", "ridgeline", "gladiator", "maverick", "santa cruz"];
const LARGE_SUV = ["suburban", "expedition", "yukon", "yukon xl", "escalade", "palisade", "telluride", "atlas", "highlander", "grand highlander",
  "sequoia", "pilot", "ascent", "traverse", "enclave", "armada", "pathfinder", "commander", "acadia", "sienna", "xl", "max", "4runner",
  "tahoe", "explorer", "durango", "grand caravan", "caravan", "pacifica", "odyssey", "carnival", "sedona", "cx-9", "cx9", "cx-90", "cx90",
  "mdx", "qx60", "qx80", "q7", "x5", "x7", "gle", "gls", "land cruiser", "gx", "navigator", "aviator", "grand wagoneer", "wagoneer",
  "range rover", "defender", "discovery", "cayenne", "xc90", "santa fe xl", "ev9", "outlander"];   // Outlander: 3 rows
const SUV = ["suv", "crossover", "sportage", "tucson", "rav4", "cr-v", "crv", "rogue", "escape", "edge", "equinox", "cx-5", "cx5", "cx-50", "cx50",
  "cx-30", "cx30", "cx-3", "seltos", "kona", "santa fe", "sante fe", "sorento", "forester", "outback", "crosstrek", "cherokee", "compass",
  "grand cherokee", "renegade", "wrangler", "encore", "terrain", "murano", "kicks", "qashqai", "hr-v", "hrv", "venza", "trailblazer",
  "blazer", "trax", "envision", "bronco", "bronco sport", "ecosport", "rvr", "eclipse cross", "tiguan", "taos", "atlas cross sport",
  "niro", "soul", "venue", "c-hr", "corolla cross", "bz4x", "rdx", "qx50", "nx", "rx", "ux", "q3", "q5", "x1", "x2", "x3", "x4", "gla", "glb",
  "glc", "macan", "xc40", "xc60", "evoque", "velar", "f-pace", "e-pace", "countryman", "gv60", "gv70", "gv80", "xt4", "xt5", "xt6", "corsair", "nautilus"];
const SEDAN = ["sedan", "civic", "corolla", "elantra", "sonata", "camry", "accord", "malibu", "impala", "jetta", "passat", "altima", "maxima",
  "versa", "yaris", "sentra", "focus", "fusion", "legacy", "impreza", "mazda3", "mazda 3", "3", "mazda6", "6", "forte", "k5", "rio", "accent",
  "cruze", "golf", "insight", "prius", "avalon", "300", "200", "lancer", "mirage", "ilx", "tlx", "integra", "is", "es", "a3", "a4", "a6",
  "c-class", "e-class", "cla", "3 series", "5 series", "320i", "330i", "328i", "340i", "fit", "spark", "sonic", "dart", "fiesta", "taurus", "cooper"];

export function detectClassFromModel(rawModel: string | null | undefined, rawMake?: string | null): VehicleClass | "" {
  const model = (rawModel || "").toLowerCase().trim();
  const make = (rawMake || "").toLowerCase().trim();
  if (!model) return make === "ram" ? "Truck" : "";

  // Hard overrides
  if (has(model, "santa fe xl")) return "Large SUV";
  if (has(model, "santa fe")) return "SUV/Crossover";
  if (has(model, "atlas cross sport")) return "SUV/Crossover";
  if (has(model, "corolla cross")) return "SUV/Crossover";
  if (has(model, "outlander sport")) return "SUV/Crossover";   // the small one (RVR), 2 rows
  if (has(model, "mustang mach-e") || has(model, "mach-e")) return "SUV/Crossover";

  if (any(model, SPORTS)) return "Sports Car";
  if (make === "ram" || any(model, TRUCKS)) return "Truck";
  if (any(model, LARGE_SUV)) return "Large SUV";
  if (any(model, SUV)) return "SUV/Crossover";
  if (any(model, SEDAN)) return "Sedan";
  return "";
}

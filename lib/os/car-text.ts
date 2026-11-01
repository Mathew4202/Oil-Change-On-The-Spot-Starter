// Reading cars out of typed notes ("2021 hyuandai veloster n 2l", "2017 ford 150 3.5l eco boost", a list of two cars).
// Used for Square appointments, where the car is only in the note. Pure, so it is tested on its own.

export type CarText = { year: number | null; make: string | null; model: string | null; engine: string | null };

const MAKES: Record<string, string> = {
  nissan: "Nissan", nissans: "Nissan", hyundai: "Hyundai", hyuandai: "Hyundai", hyundia: "Hyundai", honda: "Honda", toyota: "Toyota",
  chevy: "Chevrolet", chev: "Chevrolet", chevrolet: "Chevrolet", gmc: "GMC", jeep: "Jeep", ford: "Ford", mazda: "Mazda", subaru: "Subaru",
  kia: "Kia", vw: "Volkswagen", volkswagen: "Volkswagen", bmw: "BMW", mercedes: "Mercedes-Benz", "mercedes-benz": "Mercedes-Benz", benz: "Mercedes-Benz",
  mitsubishi: "Mitsubishi", mistubishi: "Mitsubishi", mitsubish: "Mitsubishi", chrysler: "Chrysler", dodge: "Dodge", scion: "Scion", acura: "Acura",
  ram: "Ram", lexus: "Lexus", infiniti: "Infiniti", audi: "Audi", volvo: "Volvo", buick: "Buick", cadillac: "Cadillac", lincoln: "Lincoln",
  mini: "MINI", fiat: "FIAT", genesis: "Genesis", tesla: "Tesla", pontiac: "Pontiac", saturn: "Saturn", suzuki: "Suzuki", porsche: "Porsche",
};
// a model typed without its make
const MODEL_MAKE: Record<string, string> = {
  elantra: "Hyundai", sonata: "Hyundai", tucson: "Hyundai", accent: "Hyundai", kona: "Hyundai", cruze: "Chevrolet", equinox: "Chevrolet",
  malibu: "Chevrolet", trax: "Chevrolet", spark: "Chevrolet", silverado: "Chevrolet", civic: "Honda", accord: "Honda", crv: "Honda", "cr-v": "Honda",
  pilot: "Honda", fit: "Honda", corolla: "Toyota", camry: "Toyota", rav4: "Toyota", highlander: "Toyota", tacoma: "Toyota", tundra: "Toyota",
  sienna: "Toyota", prius: "Toyota", echo: "Toyota", sentra: "Nissan", altima: "Nissan", rogue: "Nissan", versa: "Nissan", qashqai: "Nissan",
  pathfinder: "Nissan", escape: "Ford", fusion: "Ford", focus: "Ford", explorer: "Ford", f150: "Ford", "f-150": "Ford", outlander: "Mitsubishi",
  lancer: "Mitsubishi", forester: "Subaru", outback: "Subaru", impreza: "Subaru", crosstrek: "Subaru", jetta: "Volkswagen", golf: "Volkswagen",
  tiguan: "Volkswagen", atlas: "Volkswagen", soul: "Kia", forte: "Kia", sorento: "Kia", sportage: "Kia", rio: "Kia", seltos: "Kia",
};
const MODEL_FIX: Record<string, string> = {
  crv: "CR-V", "cr-v": "CR-V", hrv: "HR-V", "hr-v": "HR-V", rav4: "RAV4", f150: "F-150", "f-150": "F-150", "150": "F-150", f250: "F-250",
  qashqui: "Qashqai", foresta: "Forester", cruse: "Cruze", altas: "Atlas", ilx: "ILX", tlx: "TLX", rdx: "RDX", mdx: "MDX", gti: "GTI",
  im: "iM", x3: "X3", x5: "X5", c300: "C300", cx5: "CX-5", "cx-5": "CX-5", "cx-30": "CX-30", cx30: "CX-30", "cx-9": "CX-9", rvr: "RVR", "4runner": "4Runner",
};
// words that come after the model (trim, drivetrain, engine words): the model stops there
const STOP = new Set(["oil", "engine", "v4", "v6", "v8", "i4", "my", "lx", "le", "se", "sv", "sl", "ex", "ex-l", "gt", "gs", "xle", "xse", "lt", "ls", "ltz",
  "essential", "preferred", "luxury", "ultimate", "platinum", "limited", "classic", "awd", "4wd", "fwd", "4x4", "4motion", "eco", "ecoboost", "boost",
  "touring", "sport", "highline", "comfortline", "trendline", "r-line", "premium", "base", "hybrid", "turbo", "sxt", "slt", "denali", "sr5", "trd", "s", "es", "filter"]);
const KEEP_WORD = new Set(["n", "gt"]);   // "Veloster N" is a model, not a trim

const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** One car from a line of text. */
export function carFromText(line: string): CarText {
  const s = line.replace(/[()•,]/g, " ").replace(/\s+/g, " ").trim();
  const y = s.match(/\b(19[89]\d|20[0-3]\d)\b/);
  const eng = s.match(/\b(\d(?:\.\d)?)\s*l(?:itre|iter)?\b/i);
  const engine = eng ? `${Number(eng[1]).toFixed(1)}L` : null;
  const words = s.replace(/\b(19[89]\d|20[0-3]\d)\b/, " ").split(" ").filter(Boolean);
  let make: string | null = null, i = words.findIndex((w) => MAKES[w.toLowerCase()]);
  if (i >= 0) make = MAKES[words[i].toLowerCase()];
  else {
    const j = words.findIndex((w) => MODEL_MAKE[w.toLowerCase()]);
    if (j >= 0) { make = MODEL_MAKE[words[j].toLowerCase()]; i = j - 1; }
  }
  const model: string[] = [];
  if (make) {
    for (const w of words.slice(i + 1, i + 5)) {
      const l = w.toLowerCase();
      if (/^\d(\.\d)?l$/i.test(l) || /^\d\.\d$/.test(l)) break;                     // engine size: the model is done
      if (STOP.has(l) && !(model.length && KEEP_WORD.has(l))) { if (model.length) break; else continue; }
      model.push(MODEL_FIX[l] ?? (/\d/.test(l) && l.length <= 4 ? w.toUpperCase() : title(w)));
      if (MODEL_FIX[l] || model.length >= 2) break;
    }
  }
  return { year: y ? Number(y[1]) : null, make, model: model.join(" ") || null, engine };
}

/** All the cars in a note: one per line that has a year or a make ("Vehicles are:" headers and part numbers are skipped). */
export function carsFromText(text: string | null | undefined): CarText[] {
  if (!text) return [];
  const out: CarText[] = [];
  for (const line of text.split(/\n|\|/)) {
    const c = carFromText(line);
    if (c.make && (c.model || c.year)) out.push(c);
  }
  return out;
}

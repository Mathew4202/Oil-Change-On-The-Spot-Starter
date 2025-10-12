// data/vehicles.ts
export type VehicleClass = "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck";

type ModelDef = { name: string; cls: VehicleClass };

// NOTE: This is a big, curated set of common models. You can add more anytime.
// Everything is alphabetized for nice dropdowns.
export const MODEL_BY_MAKE: Record<string, ModelDef[]> = {
  "Acura": [
    { name: "ILX", cls: "Sedan" },
    { name: "Integra", cls: "Sedan" },
    { name: "MDX", cls: "Large SUV" },
    { name: "RDX", cls: "SUV/Crossover" },
    { name: "TLX", cls: "Sedan" },
  ],
  "Alfa Romeo": [
    { name: "Giulia", cls: "Sedan" },
    { name: "Stelvio", cls: "SUV/Crossover" },
    { name: "Tonale", cls: "SUV/Crossover" },
  ],
  "Audi": [
    { name: "A3", cls: "Sedan" },
    { name: "A4", cls: "Sedan" },
    { name: "A6", cls: "Sedan" },
    { name: "Q3", cls: "SUV/Crossover" },
    { name: "Q5", cls: "SUV/Crossover" },
    { name: "Q7", cls: "Large SUV" },
  ],
  "BMW": [
    { name: "3 Series", cls: "Sedan" },
    { name: "5 Series", cls: "Sedan" },
    { name: "X1", cls: "SUV/Crossover" },
    { name: "X3", cls: "SUV/Crossover" },
    { name: "X5", cls: "Large SUV" },
  ],
  "Buick": [
    { name: "Encore", cls: "SUV/Crossover" },
    { name: "Encore GX", cls: "SUV/Crossover" },
    { name: "Enclave", cls: "Large SUV" },
    { name: "Envision", cls: "SUV/Crossover" },
  ],
  "Cadillac": [
    { name: "CT4", cls: "Sedan" },
    { name: "CT5", cls: "Sedan" },
    { name: "XT4", cls: "SUV/Crossover" },
    { name: "XT5", cls: "SUV/Crossover" },
    { name: "XT6", cls: "Large SUV" },
    { name: "Escalade", cls: "Large SUV" },
  ],
  "Chevrolet": [
    { name: "Blazer", cls: "SUV/Crossover" },
    { name: "Equinox", cls: "SUV/Crossover" },
    { name: "Malibu", cls: "Sedan" },
    { name: "Silverado 1500", cls: "Truck" },
    { name: "Suburban", cls: "Large SUV" },
    { name: "Tahoe", cls: "Large SUV" },
    { name: "Traverse", cls: "Large SUV" },
    { name: "Trax", cls: "SUV/Crossover" },
  ],
  "Chrysler": [
    { name: "300", cls: "Sedan" },
    { name: "Pacifica", cls: "Large SUV" },
  ],
  "Dodge": [
    { name: "Charger", cls: "Sedan" },
    { name: "Durango", cls: "Large SUV" },
    { name: "Hornet", cls: "SUV/Crossover" },
    { name: "Ram 1500 (Classic)", cls: "Truck" },
  ],
  "Ford": [
    { name: "Bronco Sport", cls: "SUV/Crossover" },
    { name: "Edge", cls: "SUV/Crossover" },
    { name: "Escape", cls: "SUV/Crossover" },
    { name: "Expedition", cls: "Large SUV" },
    { name: "Explorer", cls: "Large SUV" },
    { name: "F-150", cls: "Truck" },
    { name: "Maverick", cls: "Truck" },
    { name: "Ranger", cls: "Truck" },
  ],
  "Genesis": [
    { name: "G70", cls: "Sedan" },
    { name: "G80", cls: "Sedan" },
    { name: "GV70", cls: "SUV/Crossover" },
    { name: "GV80", cls: "Large SUV" },
  ],
  "GMC": [
    { name: "Acadia", cls: "Large SUV" },
    { name: "Sierra 1500", cls: "Truck" },
    { name: "Terrain", cls: "SUV/Crossover" },
    { name: "Yukon", cls: "Large SUV" },
  ],
  "Honda": [
    { name: "Accord", cls: "Sedan" },
    { name: "Civic", cls: "Sedan" },
    { name: "CR-V", cls: "SUV/Crossover" },
    { name: "HR-V", cls: "SUV/Crossover" },
    { name: "Passport", cls: "SUV/Crossover" },
    { name: "Pilot", cls: "Large SUV" },
    { name: "Ridgeline", cls: "Truck" },
  ],
  "Hyundai": [
    { name: "Elantra", cls: "Sedan" },
    { name: "Kona", cls: "SUV/Crossover" },
    { name: "Palisade", cls: "Large SUV" },
    { name: "Santa Fe", cls: "Large SUV" },
    { name: "Sonata", cls: "Sedan" },
    { name: "Tucson", cls: "SUV/Crossover" },
    { name: "Venue", cls: "SUV/Crossover" },
  ],
  "Infiniti": [
    { name: "Q50", cls: "Sedan" },
    { name: "QX50", cls: "SUV/Crossover" },
    { name: "QX60", cls: "Large SUV" },
  ],
  "Jaguar": [
    { name: "E-PACE", cls: "SUV/Crossover" },
    { name: "F-PACE", cls: "SUV/Crossover" },
    { name: "XE", cls: "Sedan" },
  ],
  "Jeep": [
    { name: "Cherokee", cls: "SUV/Crossover" },
    { name: "Compass", cls: "SUV/Crossover" },
    { name: "Grand Cherokee", cls: "Large SUV" },
    { name: "Wrangler", cls: "SUV/Crossover" },
    { name: "Gladiator", cls: "Truck" },
  ],
  "Kia": [
    { name: "Forte", cls: "Sedan" },
    { name: "K5", cls: "Sedan" },
    { name: "Seltos", cls: "SUV/Crossover" },
    { name: "Sorento", cls: "Large SUV" },
    { name: "Soul", cls: "SUV/Crossover" },
    { name: "Sportage", cls: "SUV/Crossover" },
    { name: "Telluride", cls: "Large SUV" },
  ],
  "Land Rover": [
    { name: "Defender", cls: "Large SUV" },
    { name: "Discovery", cls: "Large SUV" },
    { name: "Range Rover Evoque", cls: "SUV/Crossover" },
    { name: "Range Rover Sport", cls: "Large SUV" },
  ],
  "Lexus": [
    { name: "ES", cls: "Sedan" },
    { name: "IS", cls: "Sedan" },
    { name: "NX", cls: "SUV/Crossover" },
    { name: "RX", cls: "Large SUV" },
    { name: "UX", cls: "SUV/Crossover" },
  ],
  "Lincoln": [
    { name: "Aviator", cls: "Large SUV" },
    { name: "Corsair", cls: "SUV/Crossover" },
    { name: "Nautilus", cls: "SUV/Crossover" },
    { name: "Navigator", cls: "Large SUV" },
  ],
  "Mazda": [
    { name: "CX-30", cls: "SUV/Crossover" },
    { name: "CX-5", cls: "SUV/Crossover" },
    { name: "CX-50", cls: "SUV/Crossover" },
    { name: "CX-9", cls: "Large SUV" },
    { name: "Mazda3", cls: "Sedan" },
    { name: "Mazda6", cls: "Sedan" },
  ],
  "Mercedes-Benz": [
    { name: "C-Class", cls: "Sedan" },
    { name: "E-Class", cls: "Sedan" },
    { name: "GLC", cls: "SUV/Crossover" },
    { name: "GLE", cls: "Large SUV" },
  ],
  "MINI": [
    { name: "Clubman", cls: "SUV/Crossover" },
    { name: "Countryman", cls: "SUV/Crossover" },
    { name: "Hardtop", cls: "Sedan" },
  ],
  "Mitsubishi": [
    { name: "Eclipse Cross", cls: "SUV/Crossover" },
    { name: "Mirage", cls: "Sedan" },
    { name: "Outlander", cls: "Large SUV" },
    { name: "RVR/Outlander Sport", cls: "SUV/Crossover" },
  ],
  "Nissan": [
    { name: "Altima", cls: "Sedan" },
    { name: "Frontier", cls: "Truck" },
    { name: "Murano", cls: "SUV/Crossover" },
    { name: "Pathfinder", cls: "Large SUV" },
    { name: "Rogue", cls: "SUV/Crossover" },
    { name: "Sentra", cls: "Sedan" },
  ],
  "Porsche": [
    { name: "Cayenne", cls: "Large SUV" },
    { name: "Macan", cls: "SUV/Crossover" },
    { name: "Panamera", cls: "Sedan" },
  ],
  "Ram": [
    { name: "1500", cls: "Truck" },
    { name: "2500", cls: "Truck" },
  ],
  "Subaru": [
    { name: "Ascent", cls: "Large SUV" },
    { name: "Crosstrek", cls: "SUV/Crossover" },
    { name: "Forester", cls: "SUV/Crossover" },
    { name: "Impreza", cls: "Sedan" },
    { name: "Outback", cls: "SUV/Crossover" },
  ],
  "Tesla": [
    { name: "Model 3", cls: "Sedan" },
    { name: "Model S", cls: "Sedan" },
    { name: "Model X", cls: "Large SUV" },
    { name: "Model Y", cls: "SUV/Crossover" },
  ],
  "Toyota": [
    { name: "4Runner", cls: "Large SUV" },
    { name: "Camry", cls: "Sedan" },
    { name: "Corolla", cls: "Sedan" },
    { name: "Highlander", cls: "Large SUV" },
    { name: "RAV4", cls: "SUV/Crossover" },
    { name: "Sequoia", cls: "Large SUV" },
    { name: "Tacoma", cls: "Truck" },
    { name: "Tundra", cls: "Truck" },
  ],
  "Volkswagen": [
    { name: "Atlas", cls: "Large SUV" },
    { name: "Golf", cls: "Sedan" },
    { name: "Jetta", cls: "Sedan" },
    { name: "Taos", cls: "SUV/Crossover" },
    { name: "Tiguan", cls: "SUV/Crossover" },
  ],
  "Volvo": [
    { name: "S60", cls: "Sedan" },
    { name: "S90", cls: "Sedan" },
    { name: "XC40", cls: "SUV/Crossover" },
    { name: "XC60", cls: "SUV/Crossover" },
    { name: "XC90", cls: "Large SUV" },
  ],
};

// Alphabetical lists
export const MAKES = Object.keys(MODEL_BY_MAKE).sort((a, b) => a.localeCompare(b));

export const YEARS = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - i);

export function modelsFor(make: string): string[] {
  return (MODEL_BY_MAKE[make] ?? []).map(m => m.name).sort((a, b) => a.localeCompare(b));
}

export function classFor(make: string, model: string): VehicleClass | null {
  const hit = (MODEL_BY_MAKE[make] ?? []).find(m => m.name === model);
  return hit?.cls ?? null;
}

// Heuristic for unknown models (keywords)
export function guessClassFromModel(model: string): VehicleClass {
  const m = model.toLowerCase();
  if (/(1500|2500|3500|f[-\s]?150|f[-\s]?250|silverado|sierra|tundra|ram|tacoma|ranger|ridgeline|frontier|gladiator)/.test(m)) return "Truck";
  if (/(suburban|expedition|max|escalade|navigator|sequoia|yukon|ascent|highlander|pilot|traverse|atlas|durango|cx[-\s]?9|palisa|telluride|q7|x5|gle|xc90)/.test(m)) return "Large SUV";
  if (/(rav4|cr[-\s]?v|rogue|escape|equinox|forester|crosstrek|tiguan|taos|q5|x3|glc|q3|x1|gv70|seltos|sportage|cx[-\s]?5|tucson|compass|cherokee|outback|venue|kona|macan|model y)/.test(m)) return "SUV/Crossover";
  return "Sedan";
}

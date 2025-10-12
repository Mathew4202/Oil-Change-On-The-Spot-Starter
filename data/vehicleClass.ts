// data/vehicleClass.ts
import type { VehicleClass } from "../lib/pricing";

export function detectClassFromModel(model: string): VehicleClass {
  const m = model.toLowerCase();

  // Sports cars / coupes (kept under Euro overrides)
  if (/(gr[-\s]?86|gr[-\s]?corolla|supra|brz|miata|mx[-\s]?5|mustang(?!\s*mach)|camaro|challenger|charger(?!\s*daytona)|corvette|370z|400z|q60|rc ?f|q50 red sport|gtr|nsx|wrx|sti|m2|m3|m4|m5|m8)/.test(m)) {
    return "Sports Car";
  }

  // Trucks
  if (/(1500|2500|3500|f[-\s]?150|f[-\s]?250|silverado|sierra|tundra|tacoma|ram\b|ranger|frontier|ridgeline|gladiator|maverick)/.test(m)) {
    return "Truck";
  }

  // Large SUVs / 3-row / full-size
  if (/(suburban|expedition|escalade|navigator|sequoia|yukon|ascent|highlander|pilot|traverse|atlas|durango|cx[-\s]?9|telluride|palisade|x5|x6|x7|q7|q8|gle|gls|xc90|mdx|enclave|armada|grand cherokee l|aviator|navigator)/.test(m)) {
    return "Large SUV";
  }

  // Crossovers / 2-row SUVs
  if (/(rav4|cr[-\s]?v|rogue|escape|equinox|forester|crosstrek|tiguan|taos|q3|q5|x1|x2|x3|glc|glb|macan|seltos|sorento|sportage|cx[-\s]?30|cx[-\s]?5|tucson|compass|cherokee|outback|venue|kona|terrain|edge|murano|nx|rx|xc40|xc60|gv70|gv80|model y|bronco sport|encore|envision|trailblazer|trax|kicks|venza)/.test(m)) {
    return "SUV/Crossover";
  }

  return "Sedan";
}


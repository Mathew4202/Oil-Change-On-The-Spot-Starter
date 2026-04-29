// lib/pricing.ts

export type VehicleClass =
  | "Sedan"
  | "SUV/Crossover"
  | "Large SUV"
  | "Truck"
  | "Sports Car";

export type ServiceType =
  | "oil_change"
  | "tire_change"
  | "serpentine_belt"
  | "spark_plugs"
  | "ignition_coil"
  | "battery"
  | "fluid_changes";

export const TAX_RATE = 0.14;

// Add on prices
export const ADDON_PRICES = {
  cabin: 10,
  engine: 10,
  wipers: 15,
  tire: 5,
} as const;

// New base oil change price per vehicle class
const OIL_BASE: Record<VehicleClass, number> = {
  Sedan: 90.0,
  "SUV/Crossover": 110.0,
  "Large SUV": 110.0,
  Truck: 130.0,

  // Non-euro performance cars default
  "Sports Car": 150.0,
};

// Euro and premium makes
const EURO_OIL_PRICE: Record<string, number> = {
  Volkswagen: 169.99,
  Audi: 169.99,
  Volvo: 169.99,

  "Mercedes-Benz": 169.99,
  BMW: 159.99,

  // Porsche often has higher capacity and higher spec oil needs
  Porsche: 189.99,
};

const SERVICE_BASE: Record<ServiceType, Record<VehicleClass, number>> = {
  oil_change: OIL_BASE,

  tire_change: {
    Sedan: 80,
    "SUV/Crossover": 90,
    "Large SUV": 100,
    Truck: 120,
    "Sports Car": 100,
  },

  serpentine_belt: {
    Sedan: 140,
    "SUV/Crossover": 150,
    "Large SUV": 170,
    Truck: 180,
    "Sports Car": 190,
  },

  spark_plugs: {
    Sedan: 160,
    "SUV/Crossover": 170,
    "Large SUV": 180,
    Truck: 200,
    "Sports Car": 220,
  },

  ignition_coil: {
    Sedan: 160,
    "SUV/Crossover": 170,
    "Large SUV": 180,
    Truck: 200,
    "Sports Car": 220,
  },

  battery: {
    Sedan: 30,
    "SUV/Crossover": 40,
    "Large SUV": 50,
    Truck: 60,
    "Sports Car": 50,
  },

  fluid_changes: {
    Sedan: 110,
    "SUV/Crossover": 130,
    "Large SUV": 140,
    Truck: 150,
    "Sports Car": 160,
  },
};

function normalizeMake(m: string) {
  const map: Record<string, string> = {
    volkswagen: "Volkswagen",
    vw: "Volkswagen",
    audi: "Audi",
    volvo: "Volvo",
    "mercedes-benz": "Mercedes-Benz",
    mercedes: "Mercedes-Benz",
    bmw: "BMW",
    porsche: "Porsche",
  };
  const k = m.trim().toLowerCase();
  return map[k] ?? capitalize(m.trim());
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function isEuroMake(m: string) {
  const k = m.trim().toLowerCase();
  return (
    k === "volkswagen" ||
    k === "vw" ||
    k === "audi" ||
    k === "volvo" ||
    k === "mercedes-benz" ||
    k === "mercedes" ||
    k === "bmw" ||
    k === "porsche"
  );
}

export function computeQuote(opts: {
  service: ServiceType;
  make: string;
  vehicleClass?: VehicleClass;
}) {
  const service = opts.service;
  const normalizedMake = normalizeMake(opts.make || "");
  const cls: VehicleClass = opts.vehicleClass || "Sedan";

  let base = SERVICE_BASE[service][cls];

  if (service === "oil_change") {
    if (normalizedMake && EURO_OIL_PRICE[normalizedMake]) {
      base = EURO_OIL_PRICE[normalizedMake];
    }
  } else {
    if (isEuroMake(normalizedMake)) base += 20;
  }

  return {
    service,
    make: normalizedMake,
    vehicleClass: cls,
    base,
  };
}

export function computeTax(subtotal: number) {
  const tax = subtotal * TAX_RATE;
  return Math.max(0, tax);
}
export type VehicleClass = 'Sedan' | 'SUV/Crossover' | 'Large SUV' | 'Truck' | 'Sports Car';

export type ServiceType =
  | 'oil_change'
  | 'tire_change'
  | 'serpentine_belt'
  | 'spark_plugs'
  | 'ignition_coil'
  | 'battery'
  | 'fluid_changes';

// Add on prices
export const ADDON_PRICES = {
  cabin: 10,   // Cabin filter +$10
  engine: 10,
  wipers: 15,  // Wiper blades +$40 (blades are 20-30 each)
  tire: 5,     // Tire pressure check +$5
} as const;

// Base oil change price per vehicle class
const OIL_BASE: Record<VehicleClass, number> = {
  Sedan: 80,          // same as before
  'SUV/Crossover': 90,
  'Large SUV': 100,
  Truck: 110,
  'Sports Car': 110,
};

// Euro oil brands with higher price
const EURO_OIL_PRICE: Record<string, number> = {
  Volkswagen: 130,
  Audi: 140,
  Volvo: 130,
  'Mercedes-Benz': 160,
  BMW: 160,
  Porsche: 170,
};

// Base prices for other services per vehicle class.
// These are "from" prices for sedans and go up by size.
const SERVICE_BASE: Record<ServiceType, Record<VehicleClass, number>> = {
  oil_change: OIL_BASE,

   tire_change: {           // fallback
    'Sedan': 80,           // 4-door, hatch, coupe
    'SUV/Crossover': 90,   // 5-seater SUV
    'Large SUV': 100,      // 7-seater / big SUV
    'Truck': 120,
    'Sports Car': 100,
  },

  serpentine_belt: {
    Sedan: 140,
    'SUV/Crossover': 150,
    'Large SUV': 170,
    Truck: 180,
    'Sports Car': 190,
  },

  spark_plugs: {
    Sedan: 160,
    'SUV/Crossover': 170,
    'Large SUV': 180,
    Truck: 200,
    'Sports Car': 220,
  },

  ignition_coil: {
    Sedan: 160,
    'SUV/Crossover': 170,
    'Large SUV': 180,
    Truck: 200,
    'Sports Car': 220,
  },

  battery: {
    Sedan: 30,
    'SUV/Crossover': 40,
    'Large SUV': 50,
    Truck: 60,
    'Sports Car': 50,
  },

  fluid_changes: {
    Sedan: 110,          // one system (brake or coolant or trans)
    'SUV/Crossover': 130,
    'Large SUV': 140,
    Truck: 150,
    'Sports Car': 160,
  },
};

// Helpers
function normalizeMake(m: string) {
  const map: Record<string, string> = {
    volkswagen: 'Volkswagen',
    audi: 'Audi',
    volvo: 'Volvo',
    'mercedes-benz': 'Mercedes-Benz',
    mercedes: 'Mercedes-Benz',
    bmw: 'BMW',
    porsche: 'Porsche',
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
    k === 'volkswagen' ||
    k === 'audi' ||
    k === 'volvo' ||
    k === 'mercedes-benz' ||
    k === 'mercedes' ||
    k === 'bmw' ||
    k === 'porsche'
  );
}

// Main quote function
export function computeQuote(opts: {
  service: ServiceType;
  make: string;
  vehicleClass?: VehicleClass;
}) {
  const service = opts.service;
  const normalizedMake = normalizeMake(opts.make || '');
  const cls: VehicleClass = opts.vehicleClass || 'Sedan';

  // Base by service and vehicle type
  let base = SERVICE_BASE[service][cls];

  // Oil change: use detailed Euro table
  if (service === 'oil_change' && normalizedMake && EURO_OIL_PRICE[normalizedMake]) {
    base = EURO_OIL_PRICE[normalizedMake];
  }

  // Other services: small extra charge for Euro cars
  if (service !== 'oil_change' && isEuroMake(normalizedMake)) {
    base += 20;
  }

  return {
    service,
    make: normalizedMake,
    vehicleClass: cls,
    base,
  };
}

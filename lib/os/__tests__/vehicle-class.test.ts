import { test } from "node:test";
import assert from "node:assert/strict";
import { detectClassFromModel as cls } from "../../../data/vehicleClass.ts";

test("price group from the model: whole words only, real models from our customers", () => {
  const cases: [string, string, string][] = [
    ["Nissan", "Maxima", "Sedan"], ["Toyota", "Camry XLE", "Sedan"], ["Nissan", "Versa", "Sedan"], ["Honda", "Civic", "Sedan"],
    ["Honda", "Civic LX", "Sedan"], ["Honda", "Civic Si", "Sports Car"], ["Honda", "Civic Type R", "Sports Car"], ["Mazda", "Mazda3", "Sedan"],
    ["Toyota", "GR86", "Sports Car"], ["Subaru", "WRX", "Sports Car"], ["Subaru", "BRZ", "Sports Car"], ["Ford", "Mustang", "Sports Car"],
    ["Ford", "Mustang Mach-E", "SUV/Crossover"], ["Mazda", "MX-5 Miata", "Sports Car"], ["Nissan", "370Z", "Sports Car"],
    ["Volkswagen", "Golf R", "Sports Car"], ["Volkswagen", "GTI", "Sports Car"], ["Volkswagen", "Jetta", "Sedan"], ["Volkswagen", "Tiguan", "Large SUV"],
    ["Volkswagen", "Atlas", "Large SUV"], ["Volkswagen", "Atlas Cross Sport", "SUV/Crossover"], ["BMW", "M3", "Sports Car"], ["BMW", "330i", "Sedan"],
    ["BMW", "X3", "SUV/Crossover"], ["BMW", "X5", "Large SUV"], ["Mercedes-Benz", "C300", ""], ["Mercedes-Benz", "GLC 300", "SUV/Crossover"],
    ["Mercedes-Benz", "AMG C 63", "Sports Car"], ["Audi", "A4", "Sedan"], ["Audi", "Q5", "SUV/Crossover"], ["Audi", "RS5", "Sports Car"],
    ["Porsche", "911", "Sports Car"], ["Porsche", "Macan", "SUV/Crossover"], ["Porsche", "Cayenne", "Large SUV"],
    ["Ram", "1500", "Truck"], ["Ram", "", "Truck"], ["GMC", "Sierra 1500", "Truck"], ["Ford", "F-150", "Truck"], ["Toyota", "Tacoma", "Truck"],
    ["Chevrolet", "Suburban", "Large SUV"], ["Ford", "Expedition Max", "Large SUV"], ["GMC", "Yukon XL", "Large SUV"], ["Kia", "Telluride", "Large SUV"],
    ["Hyundai", "Santa Fe", "SUV/Crossover"], ["Hyundai", "Santa Fe XL", "Large SUV"], ["Toyota", "Corolla Cross", "SUV/Crossover"],
    ["Toyota", "Highlander", "Large SUV"], ["Toyota", "Grand Highlander", "Large SUV"], ["Toyota", "RAV4", "SUV/Crossover"], ["Honda", "CR-V", "SUV/Crossover"],
    ["Mazda", "CX-5", "SUV/Crossover"], ["Mazda", "CX-90", "Large SUV"], ["Dodge", "Grand Caravan", "Large SUV"], ["Kia", "Soul", "SUV/Crossover"],
    ["Hyundai", "Elantra", "Sedan"], ["Hyundai", "Elantra N", "Sports Car"], ["Chevrolet", "Cruze", "Sedan"], ["Chevrolet", "Equinox", "SUV/Crossover"],
    ["Nissan", "Rogue", "SUV/Crossover"], ["Nissan", "Pathfinder", "Large SUV"], ["Jeep", "Grand Cherokee", "SUV/Crossover"], ["Mitsubishi", "RVR", "SUV/Crossover"],
  ];
  const wrong = cases.filter(([mk, m, want]) => cls(m, mk) !== want).map(([mk, m, want]) => `${mk} ${m}: got ${cls(m, mk) || "(none)"}, want ${want || "(none)"}`);
  assert.deepEqual(wrong, []);
});

test("Mitsubishi Outlander is a 3-row SUV; Outlander Sport and RVR are not", () => {
  assert.equal(cls("Outlander", "Mitsubishi"), "Large SUV");
  assert.equal(cls("Outlander PHEV", "Mitsubishi"), "Large SUV");
  assert.equal(cls("Outlander Sport", "Mitsubishi"), "SUV/Crossover");
  assert.equal(cls("RVR", "Mitsubishi"), "SUV/Crossover");
});

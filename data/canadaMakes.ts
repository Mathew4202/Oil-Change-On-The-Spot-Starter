// data/canadaMakes.ts
export const CANADA_MAKES = [
    "Acura","Alfa Romeo","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge",
    "Ford","Genesis","GMC","Honda","Hyundai","INFINITI","Jaguar","Jeep","Kia",
    "Land Rover","Lexus","Lincoln","Maserati","Mazda","Mercedes-Benz","MINI",
    "Mitsubishi","Nissan","Porsche","Ram","Subaru","Toyota","Volkswagen","Volvo",
    // Tesla is EV-only (no oil) → intentionally excluded
  ].sort((a,b)=>a.localeCompare(b));
  
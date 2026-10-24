// What we offer fleets (matches the services page). Used by the fleet form and its API.
export const FLEET_SERVICES = [
  { id: "oil", name: "Oil changes", note: "Gas and diesel, at your yard. Every visit includes our standard inspection." },
  { id: "tires", name: "Seasonal tire swaps", note: "Tires already on their own rims" },
  { id: "filters", name: "Air filters and wipers", note: "Engine and cabin air filters, front wiper blades" },
  { id: "battery", name: "Battery replacement", note: "" },
  { id: "diagnostic", name: "Diagnostics", note: "Warning lights and no-starts" },
] as const;

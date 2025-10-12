// data/variants.ts
export type VariantInfo = { engines: string[]; trims: string[] };

// Map by Make -> Model -> year range -> variants
// Keep it light now; add more as you learn your customers' cars.
export const VARIANTS: Record<string, Record<string, Record<string, VariantInfo>>> = {
  Toyota: {
    Corolla: {
      "2014-2025": {
        engines: ["1.8L I4", "2.0L I4"],
        trims: ["L","LE","SE","XLE","XSE","Hybrid LE","Hybrid SE","Hybrid XSE"]
      },
      "2009-2013": {
        engines: [
          "1.8L I4 (2ZR-FE)",
          "2.4L I4 (2AZ-FE)"   // XRS
        ],
        trims: ["CE", "LE", "S", "XRS"]
      },
      // 11th-gen (2014–2019)
      "2014-2019": {
        engines: ["1.8L I4", "1.8L Hybrid"],
        trims: ["L","LE","S","LE Eco","SE","XSE"]
      },
      // 12th-gen (2020–2025)
      "2020-2025": {
        engines: ["1.8L I4","2.0L I4","1.8L Hybrid"],
        trims: ["L","LE","XLE","SE","XSE","Hybrid LE","Hybrid SE","Hybrid XSE"]
      }
    },
    Camry: {
      "2018-2025": {
        engines: ["2.5L I4", "3.5L V6", "2.5L Hybrid"],
        trims: ["LE","SE","XSE","XLE","TRD","Hybrid LE","Hybrid SE","Hybrid XSE"]
      }
    },
    RAV4: {
      "2019-2025": {
        engines: ["2.5L I4", "2.5L Hybrid", "2.5L Plug-in Hybrid"],
        trims: ["LE","XLE","XLE Premium","Trail","Limited","Hybrid LE","Hybrid XSE","Prime SE","Prime XSE"]
      }
    },
    "GR86": {
      "2022-2025": {
        engines: ["2.4L H4"],
        trims: ["Base","Premium","TRUENO Edition"]
      }
    },
  },
  Subaru: {
    BRZ: {
      "2022-2025": {
        engines: ["2.4L H4"],
        trims: ["Base","Sport-tech"]
      }
    },
    Forester: {
      "2019-2025": {
        engines: ["2.5L H4"],
        trims: ["Convenience","Touring","Sport","Limited","Wilderness","Premier"]
      }
    }
  },
  Honda: {
    Civic: {
      "2016-2025": {
        engines: ["2.0L I4", "1.5L Turbo I4", "2.0L I4 (Type R)"],
        trims: ["LX","Sport","EX","Touring","Si","Type R"]
      }
    },
    "CR-V": {
      "2017-2025": {
        engines: ["1.5L Turbo I4", "2.0L Hybrid"],
        trims: ["LX","Sport","EX-L","Touring","Hybrid"]
      }
    }
  },
  Ford: {
    "F-150": {
      "2015-2025": {
        engines: ["2.7L EcoBoost V6","3.5L EcoBoost V6","5.0L V8","3.3L V6","3.0L Power Stroke Diesel"],
        trims: ["XL","XLT","Lariat","King Ranch","Platinum","Limited","Tremor","Raptor"]
      }
    },
    Mustang: {
      "2015-2025": {
        engines: ["2.3L EcoBoost I4","5.0L V8","5.2L V8 (Shelby)"],
        trims: ["EcoBoost","GT","Dark Horse","Shelby GT350","Shelby GT500"]
      }
    }
  },
  BMW: {
    "3 Series": {
      "2019-2025": {
        engines: ["2.0L I4 (330i)","3.0L I6 (M340i)","2.0L I4 PHEV (330e)"],
        trims: ["330i","330e","M340i"]
      }
    },
    X3: {
      "2018-2025": {
        engines: ["2.0L I4 (xDrive30i)","3.0L I6 (M40i)"],
        trims: ["xDrive30i","M40i"]
      }
    }
  },
  Volkswagen: {
    Tiguan: {
      "2018-2025": {
        engines: ["2.0L I4"],
        trims: ["Trendline","Comfortline","Highline","R-Line"]
      }
    }
  }
};

// Find the best matching variant list for year
export function getVariants(make: string, model: string, year?: number): VariantInfo | null {
  const byModel = VARIANTS[make]?.[model];
  if (!byModel) return null;
  const y = Number(year || 0);
  for (const range of Object.keys(byModel)) {
    const [a, b] = range.split("-").map(Number);
    if (y >= a && y <= b) return byModel[range];
  }
  // if no year match, return the first
  const firstKey = Object.keys(byModel)[0];
  return firstKey ? byModel[firstKey] : null;
}

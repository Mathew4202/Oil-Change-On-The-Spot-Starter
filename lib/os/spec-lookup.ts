// Automatic oil spec lookup for cars we have never serviced.
// Asks Claude (with web search) for the oil grade, spec, capacity and NAPA filter number,
// checks the answer makes sense, and returns it. The caller saves it so each car is looked up once.

export type LookedUpEngine = {
  engine: string;              // "2.0L 4-cyl", "3.5L V6 EcoBoost"
  fuel: "gas" | "diesel" | "hybrid";
  oilGrade: string;            // "0W-20" or "Euro 0W-30"
  oilSpec: string | null;      // "dexos1 Gen 3", "VW 508 00", "API SP"
  capacityL: number;           // with filter change
  napaFilter: string | null;   // NAPA Canada / NAPA ProFormer number, e.g. 27356
  wixFilter: string | null;
};

export type LookupResult = {
  engines: LookedUpEngine[];
  confidence: "high" | "medium" | "low";
  sources: string[];
  notes: string | null;
};

const EURO_MAKES = ["volkswagen", "vw", "audi", "volvo", "mercedes-benz", "mercedes", "bmw", "porsche", "mini", "land rover", "jaguar"];
const EURO_SPEC = /(VW\s*5\d\d|MB\s*229|BMW\s*LL|Longlife|Porsche\s*[AC]\d\d|Volvo\s*VCC|ACEA\s*C\d|RN\s*\d{2}|JLR|STJLR)/i;

const PROMPT = (year: number, make: string, model: string, engine?: string | null) => `
Find the engine oil specification for a ${year} ${make} ${model}${engine ? ` with the ${engine} engine` : ""}, Canadian market.
Search the web. Prefer the owner's manual, the manufacturer, or a reputable parts catalogue (Mobil, Castrol, Pennzoil). For the filter use NAPA Canada (napacanada.com), ProFormer line.

If this model was sold with more than one engine in that year${engine ? " and the engine above is unclear" : ""}, list each engine separately.

For each engine give:
- engine: size and type, e.g. "2.0L 4-cyl" or "3.5L V6 EcoBoost"
- fuel: gas, diesel or hybrid
- oil_grade: SAE grade the manual recommends for Canada, e.g. "0W-20"
- oil_spec: the approval the oil must meet if any, e.g. "dexos1 Gen 3", "VW 508 00", "MB 229.71", "BMW LL-17 FE+", else "API SP"
- capacity_l: oil capacity WITH filter change, in litres (convert quarts x 0.946)
- napa_filter: the NAPA ProFormer oil filter number from NAPA Canada. Search napacanada.com for this car's oil filter and use the ProFormer one, shown as "PPF" then the number (PPF 27356, PPF 21394, PPF 2100290); give just the number. Do NOT give a NAPA Gold number (FIL / 1xxx, 7xxx), a NAPA Platinum number, or any other brand here. Only if you cannot find the ProFormer listing, give the US NAPA Gold number (e.g. 7356, 100290) and say so in notes. null if not found.
- wix_filter: WIX number (e.g. 57356) or null

Reply with ONLY this JSON, no other text:
{"engines":[{"engine":"","fuel":"gas","oil_grade":"","oil_spec":"","capacity_l":0,"napa_filter":null,"wix_filter":null}],
 "confidence":"high|medium|low","sources":["https://..."],"notes":null}
`.trim();

/** NAPA Canada ProFormer numbers (what we buy) are the US NAPA Gold number with a 2 in front (US 7356 -> 27356, US 100290 -> 2100290).
 *  If only a WIX number is known: WIX 57356 -> 27356, WIX WL10290 -> 2100290. Exported for tests. */
export function toNapaCanada(napa: string | null, wix: string | null): string | null {
  const d = (v: string | null) => (v ?? "").replace(/\D/g, "");
  let n = d(napa);
  if (n) {
    if (/^2\d{4}$|^21\d{5}$/.test(n)) return n;         // already Canadian: 2xxxx or 21xxxxx
    if (/^\d{4}$|^1\d{5}$/.test(n)) return "2" + n;      // US style: xxxx or 1xxxxx
  }
  const w = d(wix);
  if (/^5\d{4}$/.test(w)) return "2" + w.slice(1);       // WIX 5xxxx -> NAPA 2xxxx
  if (/^1\d{4}$/.test(w)) return "210" + w.slice(1);      // WIX WL10290 -> NAPA 100290 -> 2100290
  return n || null;
}

/** Pull the JSON object out of the model's reply and check every field. Exported for tests. */
export function parseLookup(text: string, make: string): LookupResult | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: any;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(raw?.engines)) return null;

  const euroMake = EURO_MAKES.includes(make.trim().toLowerCase());
  const engines: LookedUpEngine[] = [];
  for (const e of raw.engines) {
    const g = String(e?.oil_grade ?? "").toUpperCase().replace(/\s+/g, "").match(/^(\d{1,2})W-?(\d{1,2})$/);
    const cap = Number(e?.capacity_l);
    if (!g || !(cap >= 2.5 && cap <= 12)) continue;           // reject anything that doesn't look like a real car
    const spec = e?.oil_spec ? String(e.oil_spec).trim().slice(0, 60) : null;
    const isEuro = euroMake || (spec ? EURO_SPEC.test(spec) : false);
    const grade = `${isEuro ? "Euro " : ""}${g[1]}W-${g[2]}`;
    const clean = (v: any) => (v == null ? null : String(v).replace(/[^0-9A-Za-z]/g, "").slice(0, 12) || null);
    engines.push({
      engine: String(e?.engine ?? "").trim().slice(0, 60) || "Standard",
      fuel: ["gas", "diesel", "hybrid"].includes(e?.fuel) ? e.fuel : "gas",
      oilGrade: grade,
      oilSpec: spec,
      capacityL: Math.round(cap * 10) / 10,
      napaFilter: toNapaCanada(clean(e?.napa_filter), clean(e?.wix_filter)),
      wixFilter: clean(e?.wix_filter),
    });
  }
  if (!engines.length) return null;
  const confidence = ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low";
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter((s: any) => /^https?:\/\//.test(String(s))).slice(0, 5);
  return { engines, confidence: sources.length ? confidence : "low", sources, notes: raw.notes ? String(raw.notes).slice(0, 300) : null };
}

// The lookup itself (it calls the AI) is in spec-lookup-run.ts, so this file stays testable on its own.
export { PROMPT as SPEC_PROMPT };

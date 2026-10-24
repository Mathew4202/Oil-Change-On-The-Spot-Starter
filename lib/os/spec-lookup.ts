// Automatic oil spec lookup for cars we have never serviced.
// Asks Claude (with web search) for the oil grade, spec, capacity and NAPA filter number,
// checks the answer makes sense, and returns it. The caller saves it so each car is looked up once.

export type LookedUpEngine = {
  engine: string;              // "2.0L 4-cyl", "3.5L V6 EcoBoost"
  fuel: "gas" | "diesel" | "hybrid";
  oilGrade: string;            // "0W-20" or "Euro 0W-30"
  oilSpec: string | null;      // "dexos1 Gen 3", "VW 508 00", "API SP"
  capacityL: number;           // with filter change
  napaFilter: string | null;   // NAPA Canada / NAPA Gold number, e.g. 27356
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
Search the web. Prefer the owner's manual, the manufacturer, or a reputable parts catalogue (NAPA Canada, WIX, Mobil, Castrol, Pennzoil).

If this model was sold with more than one engine in that year${engine ? " and the engine above is unclear" : ""}, list each engine separately.

For each engine give:
- engine: size and type, e.g. "2.0L 4-cyl" or "3.5L V6 EcoBoost"
- fuel: gas, diesel or hybrid
- oil_grade: SAE grade the manual recommends for Canada, e.g. "0W-20"
- oil_spec: the approval the oil must meet if any, e.g. "dexos1 Gen 3", "VW 508 00", "MB 229.71", "BMW LL-17 FE+", else "API SP"
- capacity_l: oil capacity WITH filter change, in litres (convert quarts x 0.946)
- napa_filter: NAPA Canada / NAPA Gold oil filter part number as sold in Canada (5 to 7 digits, e.g. 21334, 27356, 2100290). null if not found.
- wix_filter: WIX number (e.g. 57356) or null

Reply with ONLY this JSON, no other text:
{"engines":[{"engine":"","fuel":"gas","oil_grade":"","oil_spec":"","capacity_l":0,"napa_filter":null,"wix_filter":null}],
 "confidence":"high|medium|low","sources":["https://..."],"notes":null}
`.trim();

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
      napaFilter: clean(e?.napa_filter),
      wixFilter: clean(e?.wix_filter),
    });
  }
  if (!engines.length) return null;
  const confidence = ["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low";
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter((s: any) => /^https?:\/\//.test(String(s))).slice(0, 5);
  return { engines, confidence: sources.length ? confidence : "low", sources, notes: raw.notes ? String(raw.notes).slice(0, 300) : null };
}

export async function lookupOilSpec(year: number, make: string, model: string, engine?: string | null): Promise<LookupResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      tools: [{ type: process.env.ANTHROPIC_SEARCH_TOOL || "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: PROMPT(year, make, model, engine) }],
    }),
  });
  if (!res.ok) { console.error("spec lookup failed", res.status, await res.text()); return null; }
  const body = await res.json();
  const text = (body.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return parseLookup(text, make);
}

// Look a car up online: free Gemini with Google Search first (see ai.ts). Called through ai-budget's once-per-car gate.
import { askAI } from "@/lib/os/ai";
import { parseLookup, SPEC_PROMPT, type LookupResult } from "@/lib/os/spec-lookup";

export async function lookupOilSpec(year: number, make: string, model: string, engine?: string | null): Promise<LookupResult | null> {
  const a = await askAI({ prompt: SPEC_PROMPT(year, make, model, engine), search: true, maxTokens: 1500 });
  if (!a) return null;
  const r = parseLookup(a.text, make);
  if (r && !r.sources.length && a.sources.length) return { ...r, sources: a.sources, confidence: r.confidence === "low" ? "medium" : r.confidence };
  return r;
}

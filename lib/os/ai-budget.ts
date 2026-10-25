// Keeps AI use small (it's on Gemini's free tier, which has a daily limit). Looking a car up online is the biggest AI job, so:
//  - each car is looked up once, ever (a failure isn't retried for 30 days)
//  - two requests for the same car at the same moment (price + engine list) share one lookup
//  - a daily cap (pricing rule ai_lookups_per_day, default 25); past it, the price uses the car class and HQ checks it
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { makeKey, modelKey } from "@/lib/os/car-match";


export const lookupKey = (year: number, make: string, model: string, extra = "") => `${year}|${makeKey(make)}|${modelKey(make, model)}${extra ? `|${extra}` : ""}`;

/** "go" = look it up (claimed). "done" = looked up before (or failed recently). "busy" = running right now. "cap" = today's limit reached. */
export async function claimLookup(key: string): Promise<"go" | "done" | "busy" | "cap"> {
  try {
    const [row] = await sbGet<{ status: string; tried_at: string }>(`spec_lookups?select=status,tried_at&key=eq.${enc(key)}`);
    const age = row ? Date.now() - new Date(row.tried_at).getTime() : Infinity;
    if (row?.status === "done") return "done";
    if (row?.status === "pending" && age < 3 * 60000) return "busy";
    if (row?.status === "failed" && age < 30 * 86400000) return "done";
    const [rule] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.ai_lookups_per_day");
    const cap = rule ? Number(rule.value) : 25;
    const since = new Date(Date.now() - 86400000).toISOString();
    const today = await sbGet<{ key: string }>(`spec_lookups?select=key&tried_at=gte.${since}&status=neq.pending&limit=${cap + 1}`);
    if (today.length >= cap) return "cap";
    const r = await sbInsert("spec_lookups", { key, status: "pending", tried_at: new Date().toISOString() }, { upsertOn: "key" });
    return r.ok ? "go" : "busy";
  } catch {
    return "cap";   // migration 0029 not run: no lookups at all rather than unlimited ones
  }
}

export async function finishLookup(key: string, ok: boolean) {
  await sbPatch("spec_lookups", `key=eq.${enc(key)}`, { status: ok ? "done" : "failed", tried_at: new Date().toISOString() }).catch(() => null);
}

// One door for every AI job in the app (car lookups, reading calls and texts, VIN photos, receipts, bank PDFs).
// 1) Free first: Google Gemini's free tier (GEMINI_API_KEY from aistudio.google.com, no card needed).
// 2) Backup: Claude (ANTHROPIC_API_KEY), only when Gemini can't do it (not set up, free limit used, error),
//    and only under a hard monthly budget (pricing rule ai_paid_budget_usd, default $5). At the limit it stops for the month.
// 3) Private jobs (bank statements) skip the free tier, since Google may keep what free users send. Claude's API doesn't train on it.
// If neither can run, it returns null and the app carries on without AI.
import { sbGet, sbInsert, sbPatch } from "@/lib/os/db";

export type AiFile = { mime: string; base64: string };
export type AiAnswer = { text: string; sources: string[]; provider: "gemini" | "claude" };

// Gemini models to try in order. When one is busy (503) or out of free quota (429), the next one is tried.
const GEMINI_MODELS = () => (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-flash-latest,gemini-flash-lite-latest").split(",").map((m) => m.trim()).filter(Boolean);
let lastError: string | null = null;
/** Why the last AI request didn't work (shown in HQ so a setup problem is easy to spot). Never contains a key. */
export const aiLastError = () => lastError;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function askAI(opts: { prompt: string; file?: AiFile; search?: boolean; maxTokens?: number; big?: boolean; private?: boolean; freeOnly?: boolean }): Promise<AiAnswer | null> {
  lastError = null;
  const g = process.env.GEMINI_API_KEY;
  if (g && !opts.private) {
    const parts: any[] = [];
    if (opts.file) parts.push({ inline_data: { mime_type: opts.file.mime, data: opts.file.base64 } });
    parts.push({ text: opts.prompt });
    const errors: string[] = [];
    for (const model of GEMINI_MODELS()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"}/v1beta/models/${model}:generateContent`, {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": g },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
            // newer Gemini models "think" first and that counts against the output limit, so leave plenty of room (free either way)
            generationConfig: { maxOutputTokens: (opts.maxTokens ?? 2000) + 8192, temperature: 0.1 },
          }),
          signal: AbortSignal.timeout(opts.search ? 40000 : 25000),
        }).catch((e) => { errors.push(`${model}: ${e?.name === "TimeoutError" ? "took too long" : "couldn't reach it"}`); return null; });
        if (res?.ok) {
          const body = await res.json().catch(() => ({}));
          const c = body.candidates?.[0];
          const text = (c?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("\n").trim();
          const sources = (c?.groundingMetadata?.groundingChunks ?? []).map((x: any) => x?.web?.uri).filter(Boolean).slice(0, 5);
          if (text) return { text, sources, provider: "gemini" };
          errors.push(`${model}: no text (${c?.finishReason ?? "no reason"})`);
          break;
        }
        if (!res) break;
        const t = (await res.text().catch(() => "")).slice(0, 300);
        errors.push(`${model} ${res.status}: ${(t.match(/"message":\s*"([^"]+)/)?.[1] ?? t).slice(0, 120)}`);
        if (res.status === 503 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }   // busy: one quick retry
        break;   // 429 (free limit) or another error: try the next model
      }
    }
    lastError = `Gemini: ${errors.join(" · ")}`;
    console.error(lastError);
  } else if (!g && !opts.private) lastError = "GEMINI_API_KEY isn't on this deployment (add it in Vercel, then redeploy)";
  // Paid backup, under the monthly budget
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k || process.env.AI_ALLOW_PAID === "false" || opts.freeOnly) return null;
  const month = new Date().toISOString().slice(0, 7);
  const budget = await paidBudgetLeft(month);
  if (budget <= 0) { lastError = `${lastError ? `${lastError}. ` : ""}Paid backup off (budget used, or migration 0030 not run)`; return null; }
  const content: any[] = [];
  if (opts.file) content.push(opts.file.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.file.base64 } }
    : { type: "image", source: { type: "base64", media_type: opts.file.mime, data: opts.file.base64 } });
  content.push({ type: "text", text: opts.prompt });
  const model = opts.big ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5") : (process.env.CHEAP_AI_MODEL || "claude-haiku-5-5");
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: opts.maxTokens ?? 2000, messages: [{ role: "user", content }],
      ...(opts.search ? { tools: [{ type: process.env.ANTHROPIC_SEARCH_TOOL || "web_search_20250305", name: "web_search", max_uses: 2 }] } : {}),
    }),
    signal: AbortSignal.timeout(45000),
  }).catch(() => null);
  if (!res?.ok) {
    const t = res ? await res.text().catch(() => "") : "";
    const msg = res ? (t.match(/"message":\s*"([^"]+)/)?.[1] ?? t).slice(0, 160) : "couldn't reach it";
    lastError = `${lastError ? `${lastError}. ` : ""}Claude${res ? ` ${res.status}` : ""}: ${msg}`; console.error(lastError); return null;
  }
  const body = await res.json().catch(() => ({}));
  await addSpend(month, costOf(model, body.usage)).catch(() => null);
  const text = (body.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  return text ? { text, sources: [], provider: "claude" } : null;
}

// What a Claude request cost, in US dollars per million tokens. The defaults are set on the high side on purpose,
// so the budget stops a bit early rather than late (set AI_PRICE_* in Vercel to match the price list exactly).
export function costOf(model: string, usage: any): number {
  const small = /haiku/i.test(model);
  const inP = Number(process.env[small ? "AI_PRICE_SMALL_IN" : "AI_PRICE_BIG_IN"] || (small ? 2 : 5));
  const outP = Number(process.env[small ? "AI_PRICE_SMALL_OUT" : "AI_PRICE_BIG_OUT"] || (small ? 10 : 25));
  const tin = Number(usage?.input_tokens ?? 0) + Number(usage?.cache_creation_input_tokens ?? 0) + Number(usage?.cache_read_input_tokens ?? 0);
  const tout = Number(usage?.output_tokens ?? 0);
  const searches = Number(usage?.server_tool_use?.web_search_requests ?? 0);
  return (tin * inP + tout * outP) / 1_000_000 + searches * 0.012;
}

async function paidBudgetLeft(month: string): Promise<number> {
  try {
    const [[rule], [row]] = await Promise.all([
      sbGet<{ value: number }>("pricing_rules?select=value&key=eq.ai_paid_budget_usd"),
      sbGet<{ usd: number }>(`ai_spend?select=usd&month=eq.${month}`),
    ]);
    return (rule ? Number(rule.value) : 5) - Number(row?.usd ?? 0);
  } catch {
    return 0;   // migration 0030 not run: no paid AI rather than unlimited
  }
}

async function addSpend(month: string, usd: number) {
  const [row] = await sbGet<{ usd: number; requests: number }>(`ai_spend?select=usd,requests&month=eq.${month}`);
  if (row) await sbPatch("ai_spend", `month=eq.${month}`, { usd: Number(row.usd) + usd, requests: row.requests + 1, updated_at: new Date().toISOString() });
  else await sbInsert("ai_spend", { month, usd, requests: 1 });
}

/** For HQ: what the paid backup has spent this month. */
export async function paidSpend() {
  const month = new Date().toISOString().slice(0, 7);
  const [row] = await sbGet<{ usd: number; requests: number }>(`ai_spend?select=usd,requests&month=eq.${month}`).catch(() => []);
  const left = await paidBudgetLeft(month);
  return { month, spent: Number(row?.usd ?? 0), requests: row?.requests ?? 0, left: Math.max(0, left) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const aiReady = () => !!process.env.GEMINI_API_KEY || (!!process.env.ANTHROPIC_API_KEY && process.env.AI_ALLOW_PAID !== "false");

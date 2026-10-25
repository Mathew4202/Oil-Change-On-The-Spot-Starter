// One door for every AI job in the app (car lookups, reading calls and texts, VIN photos, receipts, bank PDFs).
// Free first: Google Gemini's free tier (GEMINI_API_KEY from aistudio.google.com, no card needed).
// Claude is only used if AI_ALLOW_PAID=true is set in Vercel. Nothing paid ever runs by accident.
// If no free AI is available (not set up, or the free daily limit is used up), it returns null and the app carries on
// without it: class price for unknown cars, calls/texts shown as-is, receipts typed in.

export type AiFile = { mime: string; base64: string };
export type AiAnswer = { text: string; sources: string[]; provider: "gemini" | "claude" };

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function askAI(opts: { prompt: string; file?: AiFile; search?: boolean; maxTokens?: number; big?: boolean }): Promise<AiAnswer | null> {
  const g = process.env.GEMINI_API_KEY;
  if (g) {
    const parts: any[] = [];
    if (opts.file) parts.push({ inline_data: { mime_type: opts.file.mime, data: opts.file.base64 } });
    parts.push({ text: opts.prompt });
    const res = await fetch(`${process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"}/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": g },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 2000, temperature: 0.1 },
      }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json().catch(() => ({}));
      const c = body.candidates?.[0];
      const text = (c?.content?.parts ?? []).map((p: any) => p.text ?? "").join("\n").trim();
      const sources = (c?.groundingMetadata?.groundingChunks ?? []).map((x: any) => x?.web?.uri).filter(Boolean).slice(0, 5);
      if (text) return { text, sources, provider: "gemini" };
    } else if (res) {
      console.error("gemini", res.status, (await res.text().catch(() => "")).slice(0, 300));   // 429 = free limit for today used up
    }
  }
  // Paid fallback only when the owners have said so
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k || process.env.AI_ALLOW_PAID !== "true") return null;
  const content: any[] = [];
  if (opts.file) content.push(opts.file.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.file.base64 } }
    : { type: "image", source: { type: "base64", media_type: opts.file.mime, data: opts.file.base64 } });
  content.push({ type: "text", text: opts.prompt });
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.big ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5") : (process.env.CHEAP_AI_MODEL || "claude-haiku-5-5"),
      max_tokens: opts.maxTokens ?? 2000, messages: [{ role: "user", content }],
      ...(opts.search ? { tools: [{ type: process.env.ANTHROPIC_SEARCH_TOOL || "web_search_20250305", name: "web_search", max_uses: 2 }] } : {}),
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => ({}));
  const text = (body.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  return text ? { text, sources: [], provider: "claude" } : null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const aiReady = () => !!process.env.GEMINI_API_KEY || (!!process.env.ANTHROPIC_API_KEY && process.env.AI_ALLOW_PAID === "true");

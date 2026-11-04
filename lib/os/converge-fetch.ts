// Converge only accepts requests from addresses on its allow list, and Vercel's free plan has no fixed address.
// So Converge requests (and only those) go through Fixie's fixed addresses when FIXIE_URL is set in Vercel
// (added by the Fixie integration, free plan). Without it, a normal request.
import { fetch as ufetch, ProxyAgent } from "undici";

let agent: ProxyAgent | null = null, agentFor = "";
const proxyUrl = () => (process.env.FIXIE_URL || process.env.CONVERGE_PROXY_URL || "").trim();
export const viaFixedAddress = () => !!proxyUrl();

export async function cfetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}) {
  const p = proxyUrl();
  if (!p) return fetch(url, init);
  if (!agent || agentFor !== p) { agent = new ProxyAgent(p); agentFor = p; }
  return ufetch(url, { ...init, dispatcher: agent });
}

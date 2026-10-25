// Read a receipt photo with Claude (vision) and turn it into clean data. The parsing/checking is pure (tested).
export type ScanItem = {
  description: string; partNumber: string | null; brand: string | null; qty: number; unitPrice: number; lineTotal: number;
  category: "oil_filter" | "cabin_filter" | "engine_filter" | "wiper" | "battery" | "oil" | "fluid" | "tool" | "supply" | "fuel" | "other";
  litresPerUnit: number | null; oilGrade: string | null;
};
export type Scan = {
  vendor: string; supplier: "napa" | "partsource" | "westpier" | "eastcoast" | "other";
  date: string | null; invoiceNo: string | null; subtotal: number | null; hst: number | null; total: number;
  paidWith: "card" | "cash" | "on_account" | "etransfer" | "unknown"; category: string; items: ScanItem[];
  warnings: string[];
};

const CATS = ["oil_filter", "cabin_filter", "engine_filter", "wiper", "battery", "oil", "fluid", "tool", "supply", "fuel", "other"] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v); return Number.isFinite(n) ? n : null; };

export function supplierOf(vendor: string): Scan["supplier"] {
  const v = vendor.toLowerCase();
  if (/napa|uap/.test(v)) return "napa";
  if (/part\s*source/.test(v)) return "partsource";
  if (/westpier|west pier/.test(v)) return "westpier";
  if (/east\s*coast/.test(v)) return "eastcoast";
  return "other";
}

/** Clean up whatever the model returned and flag anything that doesn't add up. */
export function cleanScan(raw: unknown): Scan | null {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object") return null;
  const total = num(o.total);
  if (total == null) return null;
  const vendor = String(o.vendor ?? "Unknown store").trim().slice(0, 80) || "Unknown store";
  const items: ScanItem[] = (Array.isArray(o.items) ? o.items : []).map((it: Record<string, unknown>) => {
    const qty = num(it.qty) ?? 1;
    const unit = num(it.unit_price) ?? (num(it.line_total) != null ? (num(it.line_total) as number) / (qty || 1) : 0);
    const line = num(it.line_total) ?? unit * qty;
    const cat = CATS.includes(String(it.category) as never) ? (String(it.category) as ScanItem["category"]) : "other";
    const pn = it.part_number ? String(it.part_number).toUpperCase().replace(/^(PPF|NAPA|PFG)\s*/, "").replace(/[^A-Z0-9-]/g, "").slice(0, 20) || null : null;
    const grade = it.oil_grade ? String(it.oil_grade).toUpperCase().replace(/\s+/g, "").match(/^(\d{1,2})W-?(\d{1,2})$/) : null;
    return {
      description: String(it.description ?? "").trim().slice(0, 120) || "Item", partNumber: pn,
      brand: it.brand ? String(it.brand).trim().slice(0, 40) : null, qty: r2(qty), unitPrice: r2(unit), lineTotal: r2(line), category: cat,
      litresPerUnit: num(it.litres_per_unit), oilGrade: grade ? `${grade[1]}W-${grade[2]}` : null,
    };
  }).filter((i) => i.lineTotal !== 0 || i.description !== "Item");

  const subtotal = num(o.subtotal), hst = num(o.hst);
  const warnings: string[] = [];
  const itemsSum = r2(items.reduce((t, i) => t + i.lineTotal, 0));
  if (subtotal != null && items.length && Math.abs(itemsSum - subtotal) > 0.05) warnings.push(`Items add up to $${itemsSum.toFixed(2)} but the subtotal says $${subtotal.toFixed(2)}`);
  if (subtotal != null && hst != null && Math.abs(subtotal + hst - total) > 0.05) warnings.push(`Subtotal + HST doesn't equal the total`);
  if (hst != null && subtotal != null && subtotal > 0 && Math.abs(hst / subtotal - 0.14) > 0.01) warnings.push(`HST isn't 14% of the subtotal`);
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
  if (!date) warnings.push("Couldn't read the date");
  const pw = String(o.paid_with ?? "unknown");
  const main = items.some((i) => i.category === "oil") ? "oil" : items.some((i) => /filter|wiper|battery/.test(i.category)) ? "parts"
    : items.some((i) => i.category === "fuel") ? "gas" : items.some((i) => i.category === "tool") ? "tools" : items.some((i) => i.category === "supply" || i.category === "fluid") ? "supplies" : "other";
  return {
    vendor, supplier: supplierOf(vendor), date, invoiceNo: o.invoice_no ? String(o.invoice_no).slice(0, 40) : null,
    subtotal, hst, total, paidWith: (["card", "cash", "on_account", "etransfer"].includes(pw) ? pw : "unknown") as Scan["paidWith"],
    category: main, items, warnings,
  };
}

export const SCAN_PROMPT = `This is a photo of a receipt or invoice from a business buying supplies for a mobile oil change company in Nova Scotia (HST 14%).
Read it carefully. Reply with ONLY this JSON (no other text):
{"vendor":"store name","date":"YYYY-MM-DD","invoice_no":"string or null","subtotal":0,"hst":0,"total":0,
 "paid_with":"card|cash|on_account|etransfer|unknown",
 "items":[{"description":"","part_number":"string or null","brand":"string or null","qty":1,"unit_price":0,"line_total":0,
   "category":"oil_filter|cabin_filter|engine_filter|wiper|battery|oil|fluid|tool|supply|fuel|other",
   "litres_per_unit":null,"oil_grade":null}]}
Rules: prices before tax per line. "on_account" means charged to a store account (e.g. "ACCOUNT", "CHARGE", "AR"). For motor oil give litres_per_unit (e.g. 4.4 for a 4.4 L jug, 18.9 for a pail; convert quarts x 0.946) and oil_grade like "0W-20". NAPA part numbers like "PPF 27356" -> part_number "27356", brand "NAPA ProFormer". Gas station fuel -> category "fuel". If something is unreadable use null.`;

export async function scanReceipt(imageBase64: string, mediaType: string): Promise<{ scan: Scan | null; error?: string }> {
  const { askAI } = await import("@/lib/os/ai");   // loaded here so this file stays testable on its own
  const r = await askAI({ prompt: SCAN_PROMPT, file: { mime: mediaType, base64: imageBase64 }, maxTokens: 2500, big: true });
  if (!r) return { scan: null, error: "Receipt reading isn't available right now (add GEMINI_API_KEY in Vercel, or the free daily limit is used up). Type it in for now." };
  const text = r.text;
  const a = text.indexOf("{"), z = text.lastIndexOf("}");
  try { return { scan: cleanScan(JSON.parse(text.slice(a, z + 1))) }; } catch { return { scan: null, error: "Couldn't read the receipt. Try a clearer photo." }; }
}

// Read a receipt photo with Claude (vision) and turn it into clean data. The parsing/checking is pure (tested).
export type ScanItem = {
  description: string; partNumber: string | null; brand: string | null; qty: number; unitPrice: number; lineTotal: number;
  category: "oil_filter" | "cabin_filter" | "engine_filter" | "wiper" | "battery" | "oil" | "fluid" | "washer_fluid" | "coolant" | "tool" | "supply" | "gloves" | "shop_towels" | "fuel" | "other";
  litresPerUnit: number | null; oilGrade: string | null;
  unitsPerPack?: number | null;   // shop towels: towels in each pack or roll
  listPrice?: number | null;      // the store's regular/retail price for one (NAPA "List"), before tax: what we charge for add-on parts
};
export type Scan = {
  vendor: string; supplier: "napa" | "partsource" | "westpier" | "eastcoast" | "other";
  date: string | null; invoiceNo: string | null; subtotal: number | null; hst: number | null; total: number;
  paidWith: "card" | "cash" | "on_account" | "etransfer" | "unknown"; category: string; items: ScanItem[];
  warnings: string[]; currency?: "CAD" | "USD";
};

/** Litres in a jug from the name: "3.78L", "4 L", "1 gal" (a washer fluid jug is usually 3.78 L). */
function jugLitres(words: string) {
  const l = words.match(/(\d+(?:\.\d+)?)\s*(l|lt|litre|liter)s?\b/i); if (l) return Number(l[1]);
  const g = words.match(/(\d+(?:\.\d+)?)\s*(gal|gallon)/i); if (g) return Math.round(Number(g[1]) * 3.785 * 100) / 100;
  return 3.78;
}
const CATS = ["oil_filter", "cabin_filter", "engine_filter", "wiper", "battery", "oil", "fluid", "washer_fluid", "coolant", "tool", "supply", "gloves", "shop_towels", "fuel", "other"] as const;
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

/** "200 CT", "50 sheets", "pack of 75" in a shop towel description → 200, 50, 75. */
export const towelsIn = (d: string) => { const m = d.match(/(\d{2,4})\s*(ct|count|sheets?|towels?|pk|pcs?|\/roll)\b/i) ?? d.match(/(?:pack|box|roll) of (\d{2,4})/i); return m ? Number(m[1]) : null; };

/** An environmental fee line (NAPA's "035 FILTERS LESS THAN 8IN", eco fees): part of the filter or item above it, not stock. */
export const isFee = (i: Pick<ScanItem, "description" | "partNumber">) =>
  /^0*35$/.test(i.partNumber ?? "") || /filters? (less|more|greater) than|env(iro(nmental)?)?\.? ?(fee|levy|charge)|eco[- ]?fee|stewardship|recycl\w* fee/i.test(i.description);

/** Add each fee to the item it belongs to (the one above it; the one below if it comes first), so a filter's cost includes its fee. */
export function foldFees(items: ScanItem[]) {
  for (let k = 0; k < items.length; k++) {
    if (!isFee(items[k])) continue;
    const fee = items[k];
    let to = -1;
    for (let j = k - 1; j >= 0; j--) if (!isFee(items[j])) { to = j; break; }
    if (to < 0) for (let j = k + 1; j < items.length; j++) if (!isFee(items[j])) { to = j; break; }
    if (to < 0) continue;   // only fees on the receipt: leave them
    const t = items[to];
    t.lineTotal = r2(t.lineTotal + fee.lineTotal); t.unitPrice = r2(t.lineTotal / (t.qty || 1));
    items.splice(k, 1); k--;
  }
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
    let cat = CATS.includes(String(it.category) as never) ? (String(it.category) as ScanItem["category"]) : "other";
    const words = String(it.description ?? "");
    if (/\bgloves?\b|nitrile/i.test(words)) cat = "gloves";
    else if (/shop\s*towel|blue\s*towel|wypall|wipers? towel|paper towel/i.test(words)) cat = "shop_towels";
    else if (/washer|windshield\s*(wash|fluid)|w\/s\s*fluid|-40\b|bug\s*wash/i.test(words) && cat !== "oil") cat = "washer_fluid";
    else if (/coolant|antifreeze|anti-freeze/i.test(words) && cat !== "oil") cat = "coolant";
    const pn = it.part_number ? String(it.part_number).toUpperCase().replace(/^(PPF|NAPA|PFG)\s*/, "").replace(/[^A-Z0-9-]/g, "").slice(0, 20) || null : null;
    const grade = it.oil_grade ? String(it.oil_grade).toUpperCase().replace(/\s+/g, "").match(/^(\d{1,2})W-?(\d{1,2})$/) : null;
    return {
      description: String(it.description ?? "").trim().slice(0, 120) || "Item", partNumber: pn,
      brand: it.brand ? String(it.brand).trim().slice(0, 40) : null, qty: r2(qty), unitPrice: r2(unit), lineTotal: r2(line), category: cat,
      litresPerUnit: num(it.litres_per_unit) ?? (cat === "washer_fluid" || cat === "coolant" ? jugLitres(words) : null), oilGrade: grade ? `${grade[1]}W-${grade[2]}` : null,
      ...(cat === "shop_towels" ? { unitsPerPack: num(it.units_per_pack) ?? towelsIn(words) } : {}),
      ...(num(it.list_price) != null && (num(it.list_price) as number) > 0 ? { listPrice: r2(num(it.list_price) as number) } : {}),
    };
  }).filter((i) => i.lineTotal !== 0 || i.description !== "Item");
  foldFees(items);
  // Oil priced per litre (East Coast: "Price / Litre" $6.20, qty = 20 L cases): make the price per case/jug,
  // so qty x price = the line and cost per litre comes out right ($6.20, not $6.20 / 20)
  for (const i of items) {
    if (i.category !== "oil" || !i.litresPerUnit || !i.qty || !i.unitPrice) continue;
    const perLitre = Math.abs(i.qty * i.litresPerUnit * i.unitPrice - i.lineTotal) <= 0.05 * Math.max(1, i.lineTotal) / 10 && Math.abs(i.qty * i.unitPrice - i.lineTotal) > 0.05;
    if (perLitre) i.unitPrice = r2(i.lineTotal / i.qty);
  }

  const subtotal = num(o.subtotal), hst = num(o.hst);
  const warnings: string[] = [];
  const itemsSum = r2(items.reduce((t, i) => t + i.lineTotal, 0));
  if (subtotal != null && items.length && Math.abs(itemsSum - subtotal) > 0.05) warnings.push(`Items add up to $${itemsSum.toFixed(2)} but the subtotal says $${subtotal.toFixed(2)}`);
  if (subtotal != null && hst != null && Math.abs(subtotal + hst - total) > 0.05) warnings.push(`Subtotal + HST doesn't equal the total`);
  if (hst != null && subtotal != null && subtotal > 0 && Math.abs(hst / subtotal - 0.14) > 0.01) warnings.push(`HST isn't 14% of the subtotal`);
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
  if (!date) warnings.push("Couldn't read the date");
  for (const i of items) if (i.category === "shop_towels" && !i.unitsPerPack) warnings.push(`How many towels are in each pack of "${i.description}"? Type it in so the count is right`);
  const pw = String(o.paid_with ?? "unknown");
  const main = items.some((i) => i.category === "oil") ? "oil" : items.some((i) => /filter|wiper|battery/.test(i.category)) ? "parts"
    : items.some((i) => i.category === "fuel") ? "gas" : items.some((i) => i.category === "tool") ? "tools" : items.some((i) => ["supply", "fluid", "washer_fluid", "coolant", "gloves", "shop_towels"].includes(i.category)) ? "supplies" : "other";
  return {
    vendor, supplier: supplierOf(vendor), date, invoiceNo: o.invoice_no ? String(o.invoice_no).slice(0, 40) : null,
    subtotal, hst, total, paidWith: (["card", "cash", "on_account", "etransfer"].includes(pw) ? pw : "unknown") as Scan["paidWith"],
    category: main, items, warnings, currency: /^usd$|us\s*\$|^us$/i.test(String(o.currency ?? "")) ? "USD" : "CAD",
  };
}

export const SCAN_PROMPT = `This is a photo of a receipt or invoice from a business buying supplies for a mobile oil change company in Nova Scotia (HST 14%).
Read it carefully. Reply with ONLY this JSON (no other text):
{"vendor":"store name","date":"YYYY-MM-DD","invoice_no":"string or null","subtotal":0,"hst":0,"total":0,"currency":"CAD|USD",
 "paid_with":"card|cash|on_account|etransfer|unknown",
 "items":[{"description":"","part_number":"string or null","brand":"string or null","qty":1,"unit_price":0,"line_total":0,"list_price":"number or null",
   "category":"oil_filter|cabin_filter|engine_filter|wiper|battery|oil|fluid|tool|supply|gloves|shop_towels|fuel|other",
   "litres_per_unit":null,"oil_grade":null,"units_per_pack":null}]}
Rules: prices before tax per line. "on_account" means charged to a store account (e.g. "ACCOUNT", "CHARGE", "AR"). unit_price is the price of ONE of what qty counts (one case, jug or pail): if the invoice shows a price per litre and qty in cases or jugs, unit_price = price per litre x litres in each. For motor oil give litres_per_unit (e.g. 4.4 for a 4.4 L jug, 18.9 for a pail; convert quarts x 0.946) and oil_grade like "0W-20". NAPA part numbers like "PPF 27356" -> part_number "27356", brand "NAPA ProFormer". Gas station fuel -> category "fuel". Disposable/nitrile gloves -> category "gloves", qty = number of boxes. Shop towels (blue towels, WypAll, rolls or boxes of wipes) -> category "shop_towels", qty = number of packs/rolls/boxes, units_per_pack = towels in each one (from "200 CT", "55 sheets" etc.). list_price: when the invoice shows a regular/list/retail price for one item next to the price we paid (NAPA "LIST" and "NET" or "YOUR PRICE" columns), give the list/retail price for one, before tax; otherwise null. unit_price is always what we actually paid. Windshield washer fluid -> category "washer_fluid", coolant/antifreeze -> category "coolant", both with litres_per_unit (3.78 for a 1 gallon jug, 4 for a 4 L jug). Environmental fee lines (e.g. NAPA "035 FILTERS LESS THAN 8IN") are their own items. "currency": "USD" only when the invoice is in US dollars (USD, US$, a US company's online invoice like a software subscription), otherwise "CAD". If something is unreadable use null.`;

export async function scanReceipt(imageBase64: string, mediaType: string): Promise<{ scan: Scan | null; error?: string }> {
  const { askAI, aiLastError } = await import("@/lib/os/ai");   // loaded here so this file stays testable on its own
  const r = await askAI({ prompt: SCAN_PROMPT, file: { mime: mediaType, base64: imageBase64 }, maxTokens: 2500, big: true });
  if (!r) return { scan: null, error: `Couldn't read the receipt: ${aiLastError() ?? "the AI isn't set up"}. Type it in for now.` };
  const text = r.text;
  const a = text.indexOf("{"), z = text.lastIndexOf("}");
  try { return { scan: cleanScan(JSON.parse(text.slice(a, z + 1))) }; } catch { return { scan: null, error: "Couldn't read the receipt. Try a clearer photo." }; }
}

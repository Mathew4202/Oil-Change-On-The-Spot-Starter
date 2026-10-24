// Save a scanned receipt: photo, expense, stock, and the latest prices we paid.
import crypto from "crypto";
import { sbGet, sbInsert, sbPatch, sbHeaders, enc } from "@/lib/os/db";
import type { Scan } from "@/lib/os/receipt-scan";

const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const r2 = (n: number) => Math.round(n * 100) / 100;
const HST = 1.14;

export async function storePhoto(bytes: Buffer, mediaType: string): Promise<string | null> {
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${mediaType.includes("png") ? "png" : "jpg"}`;
  const res = await fetch(`${base()}/storage/v1/object/receipts/${path}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": mediaType, "x-upsert": "true" }), body: new Uint8Array(bytes),
  });
  return res.ok ? path : null;
}

export async function photoLink(path: string): Promise<string | null> {
  const res = await fetch(`${base()}/storage/v1/object/sign/receipts/${path}`, {
    method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.signedURL ? `${base()}/storage/v1${j.signedURL}` : null;
}

const STOCK_CATS = ["oil_filter", "cabin_filter", "engine_filter", "wiper", "battery", "oil"];
const defaultBrand = (s: Scan, cat: string) =>
  s.supplier === "napa" && cat === "oil_filter" ? "NAPA ProFormer" : s.supplier === "napa" ? "NAPA" : s.supplier === "partsource" ? "PartSource" : s.vendor;

export async function saveExpense(scan: Scan, photoPath: string | null, owner: string) {
  const exp = await sbInsert<{ id: string }>("expenses", {
    vendor: scan.vendor, supplier: scan.supplier, spent_at: scan.date || new Date().toISOString().slice(0, 10),
    subtotal: scan.subtotal, hst: scan.hst, total: scan.total, category: scan.category, paid_with: scan.paidWith,
    invoice_no: scan.invoiceNo, receipt_url: photoPath, parsed: scan, description: scan.items.map((i) => i.description).join(", ").slice(0, 300),
    source: "receipt_scan", added_by: owner,
  });
  if (!exp.ok) return { ok: false as const, error: `Couldn't save: ${JSON.stringify(exp.error).slice(0, 200)}` };

  const stock: string[] = [], prices: string[] = [];
  for (const it of scan.items) {
    if (!STOCK_CATS.includes(it.category) || it.qty <= 0) continue;
    const isOil = it.category === "oil";
    if (isOil && (!it.oilGrade || !it.litresPerUnit)) continue;                 // can't track oil without grade + size
    if (!isOil && !it.partNumber) continue;                                     // filters etc. are tracked by part number
    const partNumber = isOil ? `OIL-${it.oilGrade}` : it.partNumber!;
    const brand = isOil ? (it.brand || scan.vendor) : it.brand || defaultBrand(scan, it.category);
    const addQty = isOil ? r2(it.qty * it.litresPerUnit!) : it.qty;
    const unitCostAfterTax = isOil ? r2((it.unitPrice * HST) / it.litresPerUnit!) : r2(it.unitPrice * HST);

    let [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(partNumber)}&order=on_hand.desc&limit=1`);
    if (!p) {
      const made = await sbInsert<{ id: string; on_hand: number }>("parts", { part_number: partNumber, brand, description: it.description, category: it.category,
        unit: isOil ? "L" : "each", litres_per_unit: it.litresPerUnit, oil_grade: it.oilGrade, on_hand: 0 });
      if (!made.ok) continue;
      p = made.data!;
    }
    await sbPatch("parts", `id=eq.${p.id}`, { on_hand: r2(Number(p.on_hand) + addQty) });
    await sbInsert("stock_moves", { part_id: p.id, qty: addQty, reason: "receipt", expense_id: exp.data!.id, unit_cost: unitCostAfterTax });
    await sbInsert("part_quotes", { part_id: p.id, supplier: scan.supplier, our_cost: unitCostAfterTax });
    stock.push(isOil ? `+${addQty} L ${it.oilGrade}` : `+${it.qty} × ${partNumber}`);
    prices.push(isOil ? `${it.oilGrade} now $${unitCostAfterTax.toFixed(2)}/L` : `${partNumber} now $${unitCostAfterTax.toFixed(2)}`);
    if (isOil) {
      // The pricing engine uses this: what we actually pay per litre, after HST
      const grade = /euro|vw|504|507|229|ll-0/i.test(it.description) ? `Euro ${it.oilGrade}` : it.oilGrade!;
      await sbInsert("oil_prices", { grade, cost_per_l: unitCostAfterTax, supplier: scan.vendor, updated_at: new Date().toISOString() }, { upsertOn: "grade" });
    }
  }
  return { ok: true as const, expenseId: exp.data!.id, stock, prices };
}

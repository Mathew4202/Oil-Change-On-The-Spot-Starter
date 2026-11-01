// Save a scanned receipt: photo, expense, stock, and the latest prices we paid.
import crypto from "crypto";
import { sbGet, sbInsert, sbPatch, sbDelete, sbHeaders, enc } from "@/lib/os/db";
import type { Scan } from "@/lib/os/receipt-scan";
import { linkReceiptToBank } from "@/lib/os/bank-import";

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

const STOCK_CATS = ["oil_filter", "cabin_filter", "engine_filter", "wiper", "battery", "oil", "gloves", "shop_towels"];
// supplies kept as one count each, whatever brand: gloves in boxes, shop towels in towels
const SUPPLY: Record<string, { pn: string; unit: string; name: string }> = {
  gloves: { pn: "GLOVES", unit: "box", name: "Gloves" }, shop_towels: { pn: "SHOP-TOWELS", unit: "towels", name: "Shop towels" } };
const defaultBrand = (s: Scan, cat: string) =>
  s.supplier === "napa" && cat === "oil_filter" ? "NAPA ProFormer" : s.supplier === "napa" ? "NAPA" : s.supplier === "partsource" ? "PartSource" : s.vendor;

/** A US-dollar receipt in Canadian dollars at that day's Bank of Canada rate (null when the rate can't be fetched). */
export async function inCad(scan: Scan): Promise<Scan | null> {
  const { usdToCad } = await import("@/lib/os/fx");
  const rate = await usdToCad(scan.date || new Date().toISOString().slice(0, 10));
  if (!rate) return null;
  const c = (n: number | null) => (n == null ? null : r2(n * rate));
  return { ...scan, currency: "CAD", subtotal: c(scan.subtotal), hst: c(scan.hst), total: r2(scan.total * rate),
    items: scan.items.map((i) => ({ ...i, unitPrice: r2(i.unitPrice * rate), lineTotal: r2(i.lineTotal * rate) })),
    warnings: [...scan.warnings, `Converted from US$${scan.total.toFixed(2)} at ${rate.toFixed(4)} (Bank of Canada)`] };
}

export async function saveExpense(scanIn: Scan, photoPath: string | null, owner: string) {
  // US dollars (Quo, software, online orders): saved in Canadian dollars so the books and HST are right
  const usd = scanIn.currency === "USD" ? scanIn.total : null;
  const scan = usd != null ? (await inCad(scanIn)) ?? scanIn : scanIn;
  const exp = await sbInsert<{ id: string }>("expenses", {
    vendor: scan.vendor, supplier: scan.supplier, spent_at: scan.date || new Date().toISOString().slice(0, 10),
    subtotal: scan.subtotal, hst: scan.hst, total: scan.total, category: scan.category, paid_with: scan.paidWith,
    invoice_no: scan.invoiceNo, receipt_url: photoPath, parsed: { ...scan, ...(usd != null ? { usd_total: usd } : {}) },
    description: (scan.items.map((i) => i.description).join(", ") + (usd != null && scan !== scanIn ? ` (US$${usd.toFixed(2)})` : "")).slice(0, 300),
    source: "receipt_scan", added_by: owner,
  });
  if (!exp.ok) return { ok: false as const, error: `Couldn't save: ${JSON.stringify(exp.error).slice(0, 200)}` };

  const stock: string[] = [], prices: string[] = [];
  for (const it of scan.items) {
    if (!STOCK_CATS.includes(it.category) || it.qty <= 0) continue;
    const isOil = it.category === "oil", sup = SUPPLY[it.category];
    if (isOil && (!it.oilGrade || !it.litresPerUnit)) continue;                 // can't track oil without grade + size
    if (!isOil && !sup && !it.partNumber) continue;                             // filters etc. are tracked by part number
    const partNumber = isOil ? `OIL-${it.oilGrade}` : sup ? sup.pn : it.partNumber!;
    const brand = sup ? "Shop" : isOil ? (it.brand || scan.vendor) : it.brand || defaultBrand(scan, it.category);
    const perPack = it.category === "shop_towels" ? Math.max(1, it.unitsPerPack || 1) : 1;
    const addQty = isOil ? r2(it.qty * it.litresPerUnit!) : r2(it.qty * perPack);
    const unitCostAfterTax = isOil ? r2((it.unitPrice * HST) / it.litresPerUnit!) : r2((it.unitPrice * HST) / perPack);

    let [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(partNumber)}&order=on_hand.desc&limit=1`);
    if (!p) {
      const made = await sbInsert<{ id: string; on_hand: number }>("parts", { part_number: partNumber, brand, description: sup ? sup.name : it.description, category: it.category,
        unit: isOil ? "L" : sup ? sup.unit : "each", litres_per_unit: it.litresPerUnit, oil_grade: it.oilGrade, on_hand: 0 });
      if (!made.ok) continue;
      p = made.data!;
    }
    await sbPatch("parts", `id=eq.${p.id}`, { on_hand: r2(Number(p.on_hand) + addQty) });
    await sbInsert("stock_moves", { part_id: p.id, qty: addQty, reason: "receipt", expense_id: exp.data!.id, unit_cost: unitCostAfterTax });
    await sbInsert("part_quotes", { part_id: p.id, supplier: scan.supplier, our_cost: unitCostAfterTax });
    stock.push(isOil ? `+${addQty} L ${it.oilGrade}` : sup ? `+${addQty} ${sup.unit === "box" ? (addQty === 1 ? "box" : "boxes") : "towels"} of ${sup.name.toLowerCase()}` : `+${it.qty} × ${partNumber}`);
    prices.push(isOil ? `${it.oilGrade} now $${unitCostAfterTax.toFixed(2)}/L` : sup ? `${sup.name} now $${unitCostAfterTax.toFixed(2)} a ${sup.unit === "box" ? "box" : "towel"}` : `${partNumber} now $${unitCostAfterTax.toFixed(2)}`);
    if (isOil && (unitCostAfterTax < 2 || unitCostAfterTax > 40)) {
      // a misread (litres per jug or the price): don't let it change what jobs are priced and costed at
      prices[prices.length - 1] = `${it.oilGrade} at $${unitCostAfterTax.toFixed(2)}/L looks wrong, so the oil price wasn't changed. Check the litres per jug`;
    } else if (isOil) {
      // The pricing engine uses this: what we actually pay per litre, after HST
      const grade = /euro|vw|504|507|229|ll-0/i.test(it.description) ? `Euro ${it.oilGrade}` : it.oilGrade!;
      await sbInsert("oil_prices", { grade, cost_per_l: unitCostAfterTax, supplier: scan.vendor, updated_at: new Date().toISOString() }, { upsertOn: "grade" });
    }
  }
  // if this month's bank statement is already uploaded, tick off its line
  const banked = await linkReceiptToBank(exp.data!.id, scan.total, scan.date || new Date().toISOString().slice(0, 10), scan.paidWith).catch(() => null);
  return { ok: true as const, expenseId: exp.data!.id, stock, prices, banked: !!banked, converted: usd != null && scan !== scanIn ? { usd, cad: scan.total } : null };
}

/** Fix a saved expense: amount, HST, date, what it was, category, how it was paid. */
export async function editExpense(id: string, f: { vendor?: string | null; description?: string | null; total?: number; hst?: number | null; spent_at?: string; category?: string; paid_with?: string }) {
  const patch: Record<string, unknown> = {};
  if (f.vendor !== undefined) patch.vendor = f.vendor ? String(f.vendor).slice(0, 120) : null;
  if (f.description !== undefined) patch.description = f.description ? String(f.description).slice(0, 300) : null;
  if (f.spent_at && /^\d{4}-\d{2}-\d{2}$/.test(f.spent_at)) patch.spent_at = f.spent_at;
  if (f.category) patch.category = String(f.category).slice(0, 40);
  if (f.paid_with) patch.paid_with = String(f.paid_with).slice(0, 20);
  if (f.total != null) {
    const total = r2(Number(f.total)), hst = f.hst == null ? 0 : r2(Number(f.hst));
    if (!(total >= 0 && total < 100000) || !(hst >= 0 && hst <= total)) return { ok: false as const, error: "Check the amounts" };
    Object.assign(patch, { total, hst, subtotal: r2(total - hst) });
  }
  if (!Object.keys(patch).length) return { ok: false as const, error: "Nothing to change" };
  const r = await sbPatch("expenses", `id=eq.${enc(id)}`, patch);
  return r ? { ok: true as const } : { ok: false as const, error: "Couldn't save" };
}

/** Delete a saved expense, taking back the stock it added. */
export async function deleteExpense(id: string) {
  const moves = await sbGet<{ id: string; part_id: string; qty: number }>(`stock_moves?select=id,part_id,qty&expense_id=eq.${enc(id)}`).catch(() => []);
  for (const m of moves) {
    const [p] = await sbGet<{ on_hand: number }>(`parts?select=on_hand&id=eq.${m.part_id}`);
    if (p) await sbPatch("parts", `id=eq.${m.part_id}`, { on_hand: r2(Number(p.on_hand) - Number(m.qty)) });
  }
  if (moves.length) await sbDelete("stock_moves", `expense_id=eq.${enc(id)}`);
  // a bank statement line it was ticked off against goes back to "needs a look"
  const [e] = await sbGet<{ bank_line_id: string | null }>(`expenses?select=bank_line_id&id=eq.${enc(id)}`).catch(() => []);
  if (e?.bank_line_id) await sbPatch("bank_lines", `id=eq.${e.bank_line_id}`, { status: "needs_look" }).catch(() => null);
  await sbDelete("expenses", `id=eq.${enc(id)}`);
  return { ok: true as const };
}

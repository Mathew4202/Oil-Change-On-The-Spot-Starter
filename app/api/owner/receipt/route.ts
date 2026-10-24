// POST {action:"scan", image: dataURL} → read the receipt (photo stored privately)
// POST {action:"save", scan, photoPath} → expense + stock + prices
// GET → recent receipts
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { scanReceipt, cleanScan } from "@/lib/os/receipt-scan";
import { storePhoto, saveExpense, photoLink } from "@/lib/os/expenses";
import { sbGet } from "@/lib/os/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const rows = await sbGet<{ id: string; vendor: string | null; description: string | null; total: number; spent_at: string; category: string | null; paid_with: string | null; receipt_url: string | null; added_by: string | null }>(
    "expenses?select=id,vendor,description,total,spent_at,category,paid_with,receipt_url,added_by&order=spent_at.desc,created_at.desc&limit=15");
  return NextResponse.json({ expenses: rows });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "scan") {
    const m = String(body.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return NextResponse.json({ error: "Send a photo" }, { status: 400 });
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 4_000_000) return NextResponse.json({ error: "Photo too big" }, { status: 400 });
    const [stored, read] = await Promise.all([storePhoto(bytes, m[1]), scanReceipt(m[2], m[1])]);
    if (!read.scan) return NextResponse.json({ error: read.error || "Couldn't read that receipt", photoPath: stored }, { status: 422 });
    return NextResponse.json({ scan: read.scan, photoPath: stored });
  }
  if (body.action === "save") {
    const scan = cleanScan(body.scan ? { ...body.scan, paid_with: body.scan.paidWith, invoice_no: body.scan.invoiceNo,
      items: (body.scan.items || []).map((i: Record<string, unknown>) => ({ description: i.description, part_number: i.partNumber, brand: i.brand, qty: i.qty,
        unit_price: i.unitPrice, line_total: i.lineTotal, category: i.category, litres_per_unit: i.litresPerUnit, oil_grade: i.oilGrade })) } : null);
    if (!scan) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    const r = await saveExpense(scan, typeof body.photoPath === "string" ? body.photoPath : null, owner);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }
  if (body.action === "photo") {
    const link = await photoLink(String(body.path || "").replace(/[^A-Za-z0-9/._-]/g, ""));
    return link ? NextResponse.json({ url: link }) : NextResponse.json({ error: "No photo" }, { status: 404 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// GET: every service price with its default. POST { values: { key: number | null } }: save a price (null = back to the default).
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbInsert, sbDelete } from "@/lib/os/db";
import { loadPrices, priceFieldList } from "@/lib/os/prices";
import { PRICE_FIELDS } from "@/lib/os/pricing-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  await loadPrices();
  return NextResponse.json({ fields: priceFieldList() });
}

export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const values: Record<string, unknown> = b.values && typeof b.values === "object" ? b.values : {};
  const known = new Set(PRICE_FIELDS.map((f) => f.key));
  for (const [key, raw] of Object.entries(values)) {
    if (!known.has(key)) return NextResponse.json({ error: "Unknown price" }, { status: 400 });
    if (raw === null) {
      if (!(await sbDelete("pricing_rules", `key=eq.${encodeURIComponent(key)}`))) return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
      continue;
    }
    const v = Number(raw);
    if (!(v >= 0 && v < 10000)) return NextResponse.json({ error: "Check the prices" }, { status: 400 });
    const r = await sbInsert("pricing_rules", { key, value: Math.round(v * 100) / 100, note: "service price (Prices page)" }, { upsertOn: "key" });
    if (!r.ok) return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
  await loadPrices();
  return NextResponse.json({ ok: true, fields: priceFieldList() });
}

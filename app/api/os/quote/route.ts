// Price check for the new booking page.
// GET /api/os/quote?year=2019&make=Honda&model=Civic&engine=2.0L&addons=wipers,cabin_filter&own=both&km=12
import { NextRequest, NextResponse } from "next/server";
import { buildQuote } from "@/lib/os/quote-service";
import type { Addon } from "@/lib/os/pricing-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const year = Number(q.get("year"));
  const make = (q.get("make") || "").trim();
  const model = (q.get("model") || "").trim();
  if (!year || !make || !model) return NextResponse.json({ error: "year, make and model are required" }, { status: 400 });

  try {
    const { quote, spec, match, vehicleClass } = await buildQuote({
      year, make, model, engine: q.get("engine"), vehicleClass: (q.get("class") as any) || null,
      addons: (q.get("addons") || "").split(",").filter(Boolean) as Addon["kind"][],
      own: (q.get("own") as any) || null, km: q.get("km") ? Number(q.get("km")) : null,
    });
    const owner = q.get("key") && q.get("key") === process.env.ADMIN_SECRET;
    const { cost, profit, raised, needsReview, ...publicQuote } = quote;
    return NextResponse.json({
      vehicle: { year, make, model, class: vehicleClass },
      spec: spec ? { grade: spec.oil_grade, capacityL: Number(spec.capacity_l), filter: spec.oil_filter_part, match } : null,
      ...publicQuote,
      confirmed: needsReview.length === 0,
      ...(owner ? { cost, profit, raised, needsReview } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Price check for the new booking page.
// GET /api/os/quote?year=2019&make=Honda&model=Civic&engine=2.0L&addons=wipers,cabin_filter&own=both&km=12
import { NextRequest, NextResponse } from "next/server";
import { buildQuote, filterInStock } from "@/lib/os/quote-service";
import { currentOwner, isOwner } from "@/lib/os/auth";
import { seasonWindows } from "@/lib/os/calendar";
import { seasonFor } from "@/lib/os/seasons";
import { halifaxDate } from "@/lib/os/slots";
import type { Addon } from "@/lib/os/pricing-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;   // a first-time car lookup can take ~20 s

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const year = Number(q.get("year"));
  const make = (q.get("make") || "").trim();
  const model = (q.get("model") || "").trim();
  if (!year || !make || !model) return NextResponse.json({ error: "year, make and model are required" }, { status: 400 });

  try {
    const { quote, spec, engines, lookedUp, vehicleClass } = await buildQuote({
      year, make, model, engine: q.get("engine"), vehicleClass: (q.get("class") as any) || null,
      addons: (q.get("addons") || "").split(",").filter(Boolean) as Addon["kind"][],
      own: (q.get("own") as any) || null, km: q.get("km") ? Number(q.get("km")) : null,
      cars: q.get("cars") ? Number(q.get("cars")) : 1,
      date: /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "") ? q.get("date") : halifaxDate(new Date()),
      inSeason: !!seasonFor(/^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "") ? q.get("date")! : halifaxDate(new Date()), await seasonWindows()),
      job: (["seasonal", "parts", "diagnostic", "tires", "rotation"].includes(q.get("job") || "") ? q.get("job") : "oil_change") as "oil_change" | "seasonal" | "parts" | "diagnostic" | "tires" | "rotation",
    });
    const owner = (q.get("key") && q.get("key") === process.env.ADMIN_SECRET) || !!currentOwner();   // any HQ login: part numbers and notes
    const boss = (q.get("key") && q.get("key") === process.env.ADMIN_SECRET) || isOwner();            // owners only: our cost and profit
    // HQ booking for a returning customer: their referral credits come off, same as when it's booked
    const cust = q.get("customer");
    if (owner && cust && /^[0-9a-f-]{36}$/i.test(cust)) {
      const { takeCredits } = await import("@/lib/os/referrals");
      const { addLines } = await import("@/lib/os/deals");
      const cr = await takeCredits(cust, quote.subtotal).catch(() => null);
      if (cr?.total) Object.assign(quote, addLines(quote, cr.lines, 0.14));
    }
    const { cost, profit, raised, needsReview, ...publicQuote } = quote;
    return NextResponse.json({
      vehicle: { year, make, model, class: vehicleClass },
      spec: spec ? { engine: spec.engine, grade: spec.oil_grade, oilSpec: spec.oil_spec, capacityL: Number(spec.capacity_l), filter: spec.oil_filter_part, fuel: spec.fuel ?? null,
        // the rest is for HQ: everything we know about this car's parts
        ...(owner ? { wix: (spec as { wix_filter?: string | null }).wix_filter ?? null, cabin: spec.cabin_filter_part ?? null, air: spec.air_filter_part ?? null,
          wiperDriver: spec.wiper_driver ?? null, wiperPassenger: spec.wiper_passenger ?? null, filterNote: spec.filter_note ?? null,
          source: spec.source, confidence: spec.confidence, filterInStock: spec.oil_filter_part ? await filterInStock(spec.oil_filter_part).catch(() => null) : null } : {}) } : null,
      engines,          // more than one engine: the booking page asks which one
      lookedUp,         // true the first time we see this car
      ...publicQuote,
            ...(owner ? { needsReview } : {}), ...(boss ? { cost, profit, raised } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

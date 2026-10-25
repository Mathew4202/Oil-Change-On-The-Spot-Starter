// What a customer can book on a given day (the seasonal package only shows in season).
// GET /api/os/services?date=2026-10-30
import { NextRequest, NextResponse } from "next/server";
import { seasonWindows } from "@/lib/os/calendar";
import { seasonFor } from "@/lib/os/seasons";
import { halifaxDate } from "@/lib/os/slots";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || halifaxDate(new Date());
  const windows = await seasonWindows();
  const season = seasonFor(date, windows);
  return NextResponse.json({
    date,
    season: season?.name ?? null,
    jobs: [
      { id: "oil_change", name: "Oil change", note: "Full synthetic, new filter, quick check-up" },
      ...(season ? [{ id: "seasonal", name: "Seasonal package", note: "Oil change + tire change on rims, save $15" }] : []),
      { id: "tires", name: "Tire change", note: "Tires already on rims" },
      { id: "rotation", name: "Tire rotation", note: "Wheels moved around to even out wear" },
      { id: "parts", name: "Parts only", note: "Wipers, filters or battery: $50 visit + parts" },
      { id: "diagnostic", name: "Diagnostic", note: "$100 to find the problem" },
    ],
    addons: [
      { id: "wipers", name: "Wiper blades" }, { id: "cabin_filter", name: "Cabin air filter" },
      { id: "engine_filter", name: "Engine air filter" }, { id: "battery", name: "Battery" },
      { id: "coolant", name: "Coolant top-up" }, { id: "washer_fluid", name: "Washer fluid top-up" },
    ],
    windows,
  });
}

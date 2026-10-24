// Open start times for a day.  GET /api/os/slots?date=2026-10-25&cars=1&filter=27356
import { NextRequest, NextResponse } from "next/server";
import { dayAvailability } from "@/lib/os/calendar";
import { filterInStock } from "@/lib/os/quote-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const date = q.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  try {
    const day = await dayAvailability(date, {
      cars: Math.min(5, Math.max(1, Number(q.get("cars") || 1))),
      filterInStock: await filterInStock(q.get("filter")),
    });
    return NextResponse.json(day);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

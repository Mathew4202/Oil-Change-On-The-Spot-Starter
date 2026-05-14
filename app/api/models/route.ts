import { NextResponse } from "next/server";

const EV_KEYWORDS = [
  "Leaf",
  "Bolt",
  "Bolt EUV",
  "i3",
  "i4",
  "i5",
  "i7",
  "iX",
  "iX3",
  "EQ",
  "ID.",
  "I-PACE",
  "Polestar",
  "Mach-E",
  "LYRIQ",
  "HUMMER EV",
  "bZ4X",
  "Ariya",
  "EV6",
  "EV9",
  "IONIQ 5",
  "IONIQ 6",
];

function isEVModel(name: string) {
  const n = name.toLowerCase();
  return EV_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
}

// NHTSA: we still use their model list as a base and then filter out EVs
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const make = searchParams.get("make") ?? "";
  const year = searchParams.get("year") ?? "";

  if (!make || !year) return NextResponse.json({ models: [] });

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(
    make,
  )}/modelyear/${encodeURIComponent(year)}?format=json`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const data: { Results?: { Model_Name?: string }[] } = await r.json();

    let models: string[] = Array.from(
      new Set(
        (data?.Results ?? [])
          .map((x) => (x?.Model_Name || "").trim())
          .filter((m): m is string => Boolean(m))
          .filter((m) => !isEVModel(m)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    // Ensure Toyota Sequoia is always available
    const makeNorm = make.trim().toLowerCase();
    if (makeNorm === "toyota") {
      const hasSequoia = models.some((m) => m.trim().toLowerCase() === "sequoia");
      if (!hasSequoia) models.push("Sequoia");
      models = models.sort((a, b) => a.localeCompare(b));
    }

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] }, { status: 200 });
  }
}
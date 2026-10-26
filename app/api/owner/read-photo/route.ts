// HQ: read a photo. POST {kind: "odometer" | "vin", image: "data:image/jpeg;base64,..."} → {km} or {vin, decoded}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { readOdometer, readVinPhoto, fileFromDataUrl } from "@/lib/os/photo-read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const f = fileFromDataUrl(b.image);
  if (!f || f.mime !== "image/jpeg") return NextResponse.json({ error: "Please send a photo" }, { status: 400 });
  if (b.kind === "odometer") {
    const km = await readOdometer(f.base64);
    return km ? NextResponse.json({ km }) : NextResponse.json({ error: "Couldn't read the odometer. Try again with the numbers filling the photo, or type it." }, { status: 422 });
  }
  if (b.kind === "vin") {
    const r = await readVinPhoto(f.base64);
    return r.vin ? NextResponse.json(r) : NextResponse.json({ error: "Couldn't read all 17 characters. Try a closer, sharper photo, or type it." }, { status: 422 });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}

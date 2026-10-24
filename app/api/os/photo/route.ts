// POST {image: "data:image/jpeg;base64,..."} → keeps the photo for the booking and tries to read the VIN from it.
import { NextRequest, NextResponse } from "next/server";
import { storeBookingPhoto, readVin, decodeVin } from "@/lib/os/vin-photo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const hits = new Map<string, number[]>();
const tooMany = (ip: string) => {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  list.push(now); hits.set(ip, list); return list.length > 10;
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooMany(ip)) return NextResponse.json({ error: "Too many photos. Please try again later." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const m = String(body.image || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return NextResponse.json({ error: "Please send a photo" }, { status: 400 });
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > 3_000_000 || bytes.length < 500) return NextResponse.json({ error: "That photo is too big. Try again." }, { status: 400 });
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return NextResponse.json({ error: "Please send a photo" }, { status: 400 });
  const [path, read] = await Promise.all([storeBookingPhoto(bytes), readVin(m[1])]);
  if (!path) return NextResponse.json({ error: "Couldn't save the photo. You can skip it." }, { status: 500 });
  const decoded = read.vin ? await decodeVin(read.vin) : null;
  return NextResponse.json({ photo: path, vin: read.vin, engineL: decoded?.engineL ?? read.engineL, decoded });
}

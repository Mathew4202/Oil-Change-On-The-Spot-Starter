// GET → is online payment switched on. POST {token, tip} → start a Converge payment, returns the page to send them to.
import { NextRequest, NextResponse } from "next/server";
import { payReady, startOnlinePayment } from "@/lib/os/payments";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now); hits.set(ip, list);
  return list.length > 15;
}

export async function GET() {
  return NextResponse.json({ ready: payReady() });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooMany(ip)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const tip = Number(body.tip) || 0;
  try {
    const r = await startOnlinePayment(token, tip);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Couldn't start the payment. Please try again.", detail: String(e) }, { status: 500 });
  }
}

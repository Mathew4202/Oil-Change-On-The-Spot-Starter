// Converge sends the customer back here after the card page (approved or declined).
// The URL alone proves nothing: finishOnlinePayment asks Converge directly before recording a cent.
import { NextRequest, NextResponse } from "next/server";
import { finishOnlinePayment } from "@/lib/os/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(req: NextRequest, extra: URLSearchParams | null) {
  const q = req.nextUrl.searchParams;
  const get = (k: string) => q.get(k) || extra?.get(k) || null;
  const id = get("p") || "";
  const back = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back("/");
  const r = await finishOnlinePayment(id, get("ssl_txn_id")).catch(() => ({ token: null, status: "error" as const }));
  if (!r.token) return back("/");
  return back(`/pay/${r.token}?result=${r.status}`);
}

export async function GET(req: NextRequest) { return handle(req, null); }
export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  return handle(req, new URLSearchParams(text));
}

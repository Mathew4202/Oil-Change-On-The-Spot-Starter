// The Google script in the business Gmail posts each Interac e-Transfer email here. Needs the secret (ETRANSFER_SECRET, or CRON_SECRET).
import { NextRequest, NextResponse } from "next/server";
import { applyEtransfer } from "@/lib/os/etransfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const want = process.env.ETRANSFER_SECRET || process.env.CRON_SECRET || "";
  if (!want || req.headers.get("authorization") !== `Bearer ${want}`) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id || typeof b.body !== "string") return NextResponse.json({ error: "id and body needed" }, { status: 400 });
  try { return NextResponse.json(await applyEtransfer({ id: String(b.id), subject: String(b.subject || ""), body: b.body.slice(0, 20000), date: b.date })); }
  catch (e) { return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

// The Google script in the business Gmail posts each Interac e-Transfer email here. Needs the secret (ETRANSFER_SECRET, or CRON_SECRET).
import { NextRequest, NextResponse } from "next/server";
import { applyEtransfer } from "@/lib/os/etransfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // a stray space or quote mark around the password (copying it into Vercel or the script) shouldn't lock it out
  const tidy = (v: string | undefined | null) => (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  const mine = tidy(process.env.ETRANSFER_SECRET), cron = tidy(process.env.CRON_SECRET);
  const got = tidy((req.headers.get("authorization") || "").replace(/^Bearer\s*/i, ""));
  if (!mine && !cron) return NextResponse.json({ error: "not allowed: ETRANSFER_SECRET isn't on this deployment (add it in Vercel with Production ticked, then Redeploy)" }, { status: 401 });
  if (!got || got.includes("PASTE_YOUR")) return NextResponse.json({ error: "not allowed: the script still has no password in it" }, { status: 401 });
  if (got !== mine && got !== cron) return NextResponse.json({ error: `not allowed: the password doesn't match. ${mine ? `HQ's ETRANSFER_SECRET is ${mine.length} characters long, the script sent ${got.length}` : "HQ has no ETRANSFER_SECRET yet (only the old CRON_SECRET): add it in Vercel and Redeploy"}` }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id || typeof b.body !== "string") return NextResponse.json({ error: "id and body needed" }, { status: 400 });
  try { return NextResponse.json(await applyEtransfer({ id: String(b.id), subject: String(b.subject || ""), body: b.body.slice(0, 20000), date: b.date })); }
  catch (e) { return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}

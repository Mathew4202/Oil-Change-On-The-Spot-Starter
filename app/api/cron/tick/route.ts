// Every 5 minutes (the Gmail script calls this after checking e-transfers): quick jobs that can't wait for the evening run.
// Right now: reminders to people we held a time for who haven't filled in the booking link, and the "see you in 2 hours" text. Needs ETRANSFER_SECRET or CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { runHoldNudges } from "@/lib/os/hold-nudges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tidy = (v: string | undefined | null) => (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

async function run(req: NextRequest) {
  const allowed = [tidy(process.env.ETRANSFER_SECRET), tidy(process.env.CRON_SECRET)].filter(Boolean);
  const got = tidy((req.headers.get("authorization") || "").replace(/^Bearer\s*/i, ""));
  if (!got || !allowed.includes(got)) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  try { return NextResponse.json({ ok: true, nudges: await runHoldNudges() }); }   // the 2-hour reminder (runSoonReminders) is off to save texts
  catch (e) { return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 }); }
}
export const POST = run;
export const GET = run;

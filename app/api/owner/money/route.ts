// GET ?kind=week|month|year&offset=0 → profit and loss, HST, unpaid jobs, bank status
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { periodFor, summarize, byMonth, type JobRow, type ExpRow, type Period } from "@/lib/os/money";

export const dynamic = "force-dynamic";

const JOB_COLS = "done_at,revenue,hst,tip,cost_oil,cost_parts,cost_other,done_by";
const EXP_COLS = "spent_at,total,hst,subtotal,category,description";
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const jobsBetween = (from: string, to: string) =>
  sbGet<JobRow>(`jobs?select=${JOB_COLS}&done_at=gte.${halifaxToDate(from, 0).toISOString()}&done_at=lt.${halifaxToDate(nextDay(to), 0).toISOString()}`);
const expBetween = (from: string, to: string) => sbGet<ExpRow>(`expenses?select=${EXP_COLS}&spent_at=gte.${from}&spent_at=lte.${to}`);

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const kind = (["week", "month", "year"].includes(req.nextUrl.searchParams.get("kind") || "") ? req.nextUrl.searchParams.get("kind") : "month") as Period["kind"];
  const offset = Math.max(-60, Math.min(0, Math.trunc(Number(req.nextUrl.searchParams.get("offset")) || 0)));
  const today = halifaxDate(new Date());
  const p = periodFor(kind, offset, today);
  const year = +p.from.slice(0, 4);

  const [jobs, exps, yJobs, yExps, unpaid, needs, lastImport] = await Promise.all([
    jobsBetween(p.from, p.to), expBetween(p.from, p.to),
    kind === "year" ? Promise.resolve(null) : jobsBetween(`${year}-01-01`, `${year}-12-31`),
    kind === "year" ? Promise.resolve(null) : expBetween(`${year}-01-01`, `${year}-12-31`),
    sbGet<{ id: string; starts_at: string; quoted_total: number | null; customer: { first_name: string | null; last_name: string | null } | null; jobs: { total: number | null }[] }>(
      "bookings?select=id,starts_at,quoted_total,customer:customers(first_name,last_name),jobs(total)&status=eq.done&paid_at=is.null&or=(source.is.null,source.neq.square_import)&order=starts_at.desc&limit=30"),
    sbGet<{ id: string }>("bank_lines?select=id&status=eq.needs_look").catch(() => []),
    sbGet<{ to_date: string; account: string }>("bank_imports?select=to_date,account&order=to_date.desc&limit=1").catch(() => []),
  ]);

  return NextResponse.json({
    period: p,
    summary: summarize(jobs, exps),
    months: byMonth(year, yJobs ?? jobs, yExps ?? exps, (ts) => halifaxDate(new Date(ts))),
    unpaid: unpaid.map((b) => ({ id: b.id, date: halifaxDate(new Date(b.starts_at)), name: [b.customer?.first_name, b.customer?.last_name].filter(Boolean).join(" ") || "Customer",
      amount: Number(b.jobs?.[0]?.total ?? b.quoted_total ?? 0) })),
    bank: { needsLook: needs.length, lastStatement: lastImport[0]?.to_date ?? null, today },
  });
}

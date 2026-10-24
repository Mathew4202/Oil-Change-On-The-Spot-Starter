// GET ?booking=ID → job context. POST {action: start|finish|pay|resend, ...}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentOwner } from "@/lib/os/auth";
import { jobContext, startJob, finishJob, recordPayment, sendReceipt } from "@/lib/os/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Check = z.object({ status: z.enum(["ok", "soon", "now"]), note: z.string().max(200).optional() });
const Finish = z.object({
  action: z.literal("finish"), bookingId: z.string().uuid(),
  km: z.number().int().min(0).max(2_000_000).nullable().optional(),
  vin: z.string().max(25).nullable().optional(),
  oilGrade: z.string().max(20).nullable().optional(), oilLitres: z.number().min(0).max(40).nullable().optional(),
  filterPart: z.string().max(20).nullable().optional(),
  inspection: z.record(z.string(), Check).optional(),
  extraLines: z.array(z.object({ label: z.string().max(80), amount: z.number().min(-2000).max(5000) })).max(10).optional(),
  doneBy: z.enum(["both", "mathew", "harsh"]).optional(), notes: z.string().max(1000).optional(),
  payMethod: z.enum(["card_terminal", "cash", "etransfer", "card_online"]).nullable().optional(),
  tip: z.number().min(0).max(1000).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")), sendReceipt: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("booking") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const ctx = await jobContext(id);
  return ctx ? NextResponse.json(ctx) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.bookingId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    if (body.action === "start") return NextResponse.json({ ok: await startJob(id) });
    if (body.action === "finish") {
      const p = Finish.safeParse(body);
      if (!p.success) return NextResponse.json({ error: "Please check the job details", details: p.error.flatten() }, { status: 400 });
      const r = await finishJob({ ...p.data, email: p.data.email || null }, owner);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (body.action === "pay") {
      const method = z.enum(["card_terminal", "cash", "etransfer", "card_online"]).safeParse(body.method);
      const ctx = await jobContext(id);
      if (!method.success || !ctx?.job) return NextResponse.json({ error: "Finish the job first, then pick how they paid" }, { status: 400 });
      const tip = Math.min(1000, Math.max(0, Number(body.tip) || 0));
      await recordPayment(id, Number(ctx.job.total), method.data, owner, tip);
      const receipt = body.sendReceipt === false ? null : await sendReceipt(String(ctx.job.id), body.email || null);
      return NextResponse.json({ ok: true, receipt });
    }
    if (body.action === "resend") {
      const ctx = await jobContext(id);
      if (!ctx?.job) return NextResponse.json({ error: "No receipt yet" }, { status: 400 });
      return NextResponse.json({ ok: true, receipt: await sendReceipt(String(ctx.job.id), body.email || null) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong", detail: String(e) }, { status: 500 });
  }
}

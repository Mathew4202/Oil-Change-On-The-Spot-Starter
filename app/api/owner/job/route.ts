// GET ?booking=ID → job context. POST {action: start|finish|pay|resend, ...}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentOwner } from "@/lib/os/auth";
import { sbPatch } from "@/lib/os/db";
import { jobContext, startJob, finishJob, recordPayment, sendReceipt } from "@/lib/os/jobs";
import { payReady } from "@/lib/os/payments";
import { payLink, textCustomer } from "@/lib/os/customer-texts";

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
  return ctx ? NextResponse.json({ ...ctx, payOnline: payReady() }) : NextResponse.json({ error: "Not found" }, { status: 404 });
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
      if (ctx.job.imported_from === "job_tracker") return NextResponse.json({ error: "This job is already in your Job Tracker sheet, so it's already counted." }, { status: 400 });
      const tip = Math.min(1000, Math.max(0, Number(body.tip) || 0));
      const due = Math.max(0, Math.round((Number(ctx.job.total) - (ctx.paid - Number(ctx.job.tip ?? 0))) * 100) / 100);
      await recordPayment(id, due, method.data, owner, tip);
      const receipt = body.sendReceipt === false ? null : await sendReceipt(String(ctx.job.id), body.email || null);
      return NextResponse.json({ ok: true, receipt });
    }
    if (body.action === "close") {   // job already logged in the sheet: just close the booking
      const ctx = await jobContext(id);
      if (ctx?.job?.imported_from !== "job_tracker") return NextResponse.json({ error: "Use Finish job for this one" }, { status: 400 });
      const at = String(ctx.job.done_at || new Date().toISOString());
      await sbPatch("bookings", `id=eq.${id}`, { status: "done", finished_at: at, ...(ctx.booking.paid_at ? {} : { paid_at: at }) });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "paylink") {   // text them a link to pay online
      const ctx = await jobContext(id);
      if (!ctx?.job || !ctx.job.receipt_token) return NextResponse.json({ error: "Finish the job first" }, { status: 400 });
      if (!payReady()) return NextResponse.json({ error: "Online payment isn't set up yet" }, { status: 400 });
      if (!ctx.customer?.phone) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });
      const due = Math.max(0, Math.round((Number(ctx.job.total) - (ctx.paid - Number(ctx.job.tip ?? 0))) * 100) / 100);
      if (due <= 0) return NextResponse.json({ error: "Nothing left to pay" }, { status: 400 });
      const r = await textCustomer("pay_request", ctx.customer, { total: `$${due.toFixed(2)}`, pay_link: payLink(String(ctx.job.receipt_token)) }, id);
      return NextResponse.json({ ok: true, sms: r });
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

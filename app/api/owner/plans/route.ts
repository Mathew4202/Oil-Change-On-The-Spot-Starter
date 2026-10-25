// HQ maintenance plans. GET → requests, offers, active plans · POST {action, ...}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { plansOverview, offerPlan, textTerms, activatePlan, markBillPaid, resendBill, endPlan, type Plan } from "@/lib/os/plans";

export const dynamic = "force-dynamic";
const okId = (x: unknown) => /^[0-9a-f-]{36}$/i.test(String(x || ""));

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json(await plansOverview());
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "offer": { const r = await offerPlan(okId(b.requestId) ? { requestId: b.requestId } : b.plan || {}, owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "decline": if (okId(b.requestId)) { await sbPatch("plan_requests", `id=eq.${enc(b.requestId)}`, { status: "declined" }); return NextResponse.json({ ok: true }); } break;
      case "terms": if (okId(b.planId)) { const [p] = await sbGet<Plan>(`plans?select=*&id=eq.${enc(b.planId)}`); return NextResponse.json({ ok: !!p, sms: p ? await textTerms(p) : null }); } break;
      case "start": if (okId(b.planId)) { const [p] = await sbGet<Plan>(`plans?select=*&id=eq.${enc(b.planId)}&status=eq.offered`); if (!p) break; return NextResponse.json(await activatePlan(p, owner)); } break;
      case "paid": if (okId(b.billId)) { const r = await markBillPaid(b.billId, ["etransfer", "cash", "card_terminal", "cheque"].includes(b.method) ? b.method : "etransfer", owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); } break;
      case "bill": if (okId(b.billId)) return NextResponse.json({ ok: true, sms: await resendBill(b.billId) }); break;
      case "end": if (okId(b.planId)) return NextResponse.json(await endPlan(b.planId, !!b.cancelled)); break;
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong", detail: String(e) }, { status: 500 });
  }
}

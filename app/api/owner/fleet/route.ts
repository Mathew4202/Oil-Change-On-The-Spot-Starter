// HQ fleets. GET → all accounts (+ website requests) · GET ?id= → one account · POST {action, ...}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbPatch, enc } from "@/lib/os/db";
import { ensurePortal, textPortal } from "@/lib/os/fleet-portal";
import { listAccounts, accountDetail, saveAccount, saveVehicle, normalPrice, bookFleetVisit, makeInvoices, sendInvoice, markInvoicePaid, voidInvoice } from "@/lib/os/fleet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (!id) return NextResponse.json(await listAccounts());
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    const d = await accountDetail(id);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // our normal price next to each vehicle, so the fleet price can be set with the profit in view
    const normal: Record<string, { price: number; cost: number | null; oil: string | null } | null> = {};
    const queue = [...d.vehicles];
    await Promise.all(Array.from({ length: 4 }, async () => { for (let v = queue.shift(); v; v = queue.shift()) normal[v.id] = await normalPrice(v).catch(() => null); }));
    return NextResponse.json({ ...d, normal });
  } catch (e) {
    return NextResponse.json({ error: "Couldn't load fleets", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const acct = String(b.accountId || "");
  const okId = (x: string) => /^[0-9a-f-]{36}$/i.test(x);
  try {
    switch (b.action) {
      case "account": { const r = await saveAccount(b.account || {}); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "vehicle": { if (!okId(acct)) break; const r = await saveVehicle(acct, b.vehicle || {}); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "book": {
        if (!okId(acct)) break;
        const r = await bookFleetVisit(acct, (b.vehicleIds || []).filter(okId), String(b.start || ""), owner, String(b.note || "").slice(0, 300));
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "invoice": { if (!okId(acct)) break; const r = await makeInvoices(acct, (b.jobIds || []).filter(okId)); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "send": { if (!okId(String(b.invoiceId))) break; return NextResponse.json(await sendInvoice(String(b.invoiceId), b.to || null)); }
      case "paid": { if (!okId(String(b.invoiceId))) break; const r = await markInvoicePaid(String(b.invoiceId), String(b.method || ""), owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "void": { if (!okId(String(b.invoiceId))) break; const r = await voidInvoice(String(b.invoiceId)); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
      case "portal": {   // the fleet's own page: get the link, text it to them, or make a new one (old link stops working)
        if (!okId(acct)) break;
        if (b.send) { const r = await textPortal(acct); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
        return NextResponse.json({ ok: true, link: await ensurePortal(acct, !!b.reset) });
      }
      case "request": {
        if (!okId(String(b.requestId)) || !["new", "contacted", "quoted", "won", "lost"].includes(b.status)) break;
        await sbPatch("fleet_requests", `id=eq.${enc(String(b.requestId))}`, { status: b.status });
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong", detail: String(e) }, { status: 500 });
  }
}

// HQ fleets. GET → all accounts (+ website requests) · GET ?id= → one account · POST {action, ...}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner, currentStaff } from "@/lib/os/auth";
import { canOf } from "@/lib/os/roles";
import { dayAvailability } from "@/lib/os/calendar";
import { readVehicleList, fileFromDataUrl } from "@/lib/os/photo-read";
import { numberUnits } from "@/lib/os/fleet-list";
import { sbPatch, enc } from "@/lib/os/db";
import { ensurePortal, textPortal } from "@/lib/os/fleet-portal";
import { listAccounts, accountDetail, saveAccount, saveVehicle, saveVehicles, visitMinutes, normalPrice, bookFleetVisit, makeInvoices, sendInvoice, markInvoicePaid, voidInvoice } from "@/lib/os/fleet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const money = canOf(currentStaff()?.role).money;
  try {
    // open start times for a yard visit with this many vehicles (taken times are left out)
    const tDate = req.nextUrl.searchParams.get("times");
    if (tDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tDate)) return NextResponse.json({ slots: [] });
      const n = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get("count")) || 1));
      return NextResponse.json(await dayAvailability(tDate, { cars: 1, minutes: await visitMinutes(n), filterInStock: true }));
    }
    if (!id) return NextResponse.json(await listAccounts());
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    const d = await accountDetail(id);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // our normal price next to each vehicle, so the fleet price can be set with the profit in view
    const normal: Record<string, { price: number; cost: number | null; oil: string | null } | null> = {};
    const queue = [...d.vehicles];
    await Promise.all(Array.from({ length: 4 }, async () => { for (let v = queue.shift(); v; v = queue.shift()) normal[v.id] = await normalPrice(v).catch(() => null); }));
    if (!money) for (const k of Object.keys(normal)) if (normal[k]) normal[k] = { ...normal[k]!, cost: null };   // staff don't see our cost
    return NextResponse.json({ ...d, normal, ...(canOf(currentStaff()?.role).invoices ? {} : { invoices: [], unbilled: [] }) });
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
  if (["invoice", "send", "paid", "void"].includes(b.action) && !canOf(currentStaff()?.role).invoices) return NextResponse.json({ error: "Only the owners do invoices." }, { status: 403 });
  try {
    switch (b.action) {
      case "scan": {   // a photo or file of their vehicle list (or several VINs): read every vehicle, number the ones without a unit #
        if (!okId(acct)) break;
        const f = fileFromDataUrl(b.file);
        if (!f) return NextResponse.json({ error: "Send a photo or a PDF under 4 MB" }, { status: 400 });
        const d = await accountDetail(acct);
        const r = await readVehicleList(f);
        return NextResponse.json({ ...r, rows: numberUnits(r.rows, (d?.vehicles ?? []).map((v) => v.unit_number)), existingVins: (d?.vehicles ?? []).map((v) => v.vin).filter(Boolean), existingPlates: (d?.vehicles ?? []).map((v) => v.plate).filter(Boolean) });
      }
      case "vehicles": { if (!okId(acct)) break; return NextResponse.json(await saveVehicles(acct, Array.isArray(b.vehicles) ? b.vehicles : [])); }
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

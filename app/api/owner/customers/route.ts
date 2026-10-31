// GET ?q= → quick search (booking form) · ?list=1 → everyone with visits / spend / next due · ?id= → one customer
// PATCH {id, ...fields} → edit · POST {action:"merge", from, into} → same person twice
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, enc } from "@/lib/os/db";
import { listCustomers, customerDetail, updateCustomer, mergeCustomers } from "@/lib/os/customers";
import { referralInfo, giveCredit, removeCredit, setReferredBy, ensureRefCode, refLink } from "@/lib/os/referrals";
import { sendSms } from "@/lib/os/sms";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("list")) return NextResponse.json({ customers: await listCustomers() });
  const rid = sp.get("referrals");
  if (rid) return UUID.test(rid) ? NextResponse.json(await referralInfo(rid)) : NextResponse.json({ error: "bad id" }, { status: 400 });
  const id = sp.get("id");
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    if (sp.get("brief")) {   // for opening the booking form with this customer
      const [c] = await sbGet(`customers?select=id,first_name,last_name,phone,email,address,vehicles(id,year,make,model,engine)&id=eq.${enc(id)}`);
      return c ? NextResponse.json({ customer: c }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const d = await customerDetail(id);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const q = (sp.get("q") || "").trim().replace(/[,()*]/g, " ").slice(0, 40);
  if (q.length < 2) return NextResponse.json({ customers: [] });
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  const ors = digits.length >= 3
    ? [`phone.ilike.*${digits}*`]
    : words.length > 1
      ? [`and(first_name.ilike.*${words[0]}*,last_name.ilike.*${words.slice(1).join(" ")}*)`, `first_name.ilike.*${q}*`]
      : [`first_name.ilike.*${q}*`, `last_name.ilike.*${q}*`];
  const rows = await sbGet(
    `customers?select=id,first_name,last_name,phone,email,address,vehicles(id,year,make,model,engine)` +
    `&or=(${enc(ors.join(","))})&order=first_name&limit=8`);
  return NextResponse.json({ customers: rows });
}

export async function PATCH(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(String(b.id || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const r = await updateCustomer(b.id, { firstName: str(b.firstName), lastName: str(b.lastName), phone: str(b.phone), email: str(b.email),
    address: str(b.address), notes: str(b.notes), smsOff: typeof b.smsOff === "boolean" ? b.smsOff : undefined }, owner);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  // referrals: give or take back a credit, set who referred them, text them their link
  if (["credit", "uncredit", "referredBy", "sendLink"].includes(b.action)) {
    if (!UUID.test(String(b.id || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
    if (b.action === "credit") { const r = await giveCredit(b.id, Number(b.amount), String(b.note || ""), owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
    if (b.action === "uncredit") return NextResponse.json({ ok: UUID.test(String(b.creditId || "")) && await removeCredit(String(b.creditId)) });
    if (b.action === "referredBy") {
      if (!UUID.test(String(b.referrerId || ""))) return NextResponse.json({ error: "Pick who referred them" }, { status: 400 });
      const ok = await setReferredBy(b.id, String(b.referrerId));
      return NextResponse.json(ok ? { ok: true } : { ok: false, error: "Already set, or they've already had a visit (the $5 goes out on the friend's first visit)." }, { status: ok ? 200 : 400 });
    }
    const [c] = await sbGet<{ first_name: string | null; phone: string | null; sms_opt_out: boolean | null }>(`customers?select=first_name,phone,sms_opt_out&id=eq.${enc(b.id)}`);
    const code = await ensureRefCode(b.id);
    if (!c?.phone || !code) return NextResponse.json({ ok: false, error: c?.phone ? "Run migration 0033 first" : "No phone number on file" }, { status: 400 });
    if (c.sms_opt_out) return NextResponse.json({ ok: false, error: "They turned texts off" }, { status: 400 });
    const r = await sendSms(c.phone, `Hi ${c.first_name?.trim() || "there"}, here's your link to share with friends and family: ${refLink(code)}\nWhen someone books with it, you get $5 off your next oil change.\n- {signer}, Oil Change On The Spot`, { kind: "referral_link", customerId: b.id });
    return NextResponse.json({ ok: r.sent, error: r.sent ? undefined : r.error || "The text didn't go out" });
  }
  if (b.action !== "merge" || !UUID.test(String(b.from || "")) || !UUID.test(String(b.into || ""))) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await mergeCustomers(b.from, b.into);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

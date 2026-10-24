// GET: public key for the phone. POST {subscription, test?}: save this phone (and optionally send a test). DELETE {endpoint}: turn off.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbInsert, sbHeaders, enc } from "@/lib/os/db";
import { vapidKeys, pushToOwners } from "@/lib/os/push";

export const dynamic = "force-dynamic";
const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json({ publicKey: (await vapidKeys()).publicKey });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { subscription, test } = await req.json().catch(() => ({}));
  const endpoint = subscription?.endpoint, p256dh = subscription?.keys?.p256dh, auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  const r = await sbInsert("push_subscriptions", { owner, endpoint, p256dh, auth, device: (req.headers.get("user-agent") || "").slice(0, 200) }, { upsertOn: "endpoint" });
  if (!r.ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  const result = test ? await pushToOwners({ title: "Notifications are on", body: "You'll get a buzz for every new booking.", url: "/owner", tag: "test" }, owner) : null;
  return NextResponse.json({ ok: true, test: result });
}

export async function DELETE(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await fetch(`${base()}/rest/v1/push_subscriptions?endpoint=eq.${enc(endpoint)}`, { method: "DELETE", headers: sbHeaders() });
  return NextResponse.json({ ok: true });
}

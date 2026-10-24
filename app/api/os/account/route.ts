// Customer sign-in by text code.
// GET → { signedIn, profile } · POST {action:"send", phone} · POST {action:"verify", phone, code} · POST {action:"signout"}
import { NextRequest, NextResponse } from "next/server";
import { sendCode, checkCode, customerCookie, currentCustomer, profileFor, CUSTOMER_COOKIE } from "@/lib/os/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const id = currentCustomer();
  const profile = id ? await profileFor(id) : null;
  return NextResponse.json({ signedIn: !!profile, profile });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.action === "send") {
    const r = await sendCode(String(b.phone || ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (b.action === "verify") {
    const r = await checkCode(String(b.phone || ""), String(b.code || ""));
    if (!r.ok || !r.customerId) return NextResponse.json(r, { status: 400 });
    const res = NextResponse.json({ ok: true, profile: await profileFor(r.customerId) });
    const c = customerCookie(r.customerId); res.cookies.set(c.name, c.value, c.options);
    return res;
  }
  if (b.action === "signout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CUSTOMER_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

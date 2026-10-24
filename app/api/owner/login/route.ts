import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sessionCookie, ownerList } from "@/lib/os/auth";

export async function POST(req: NextRequest) {
  const { name, password } = await req.json().catch(() => ({}));
  // Tell the owner exactly what's missing instead of a vague "wrong password"
  if (!process.env.ADMIN_SECRET && !process.env.OWNER_SESSION_SECRET) {
    return NextResponse.json({ error: "Setup: ADMIN_SECRET is missing on this deployment" }, { status: 500 });
  }
  const owners = ownerList();
  if (!owners.length) {
    return NextResponse.json({ error: "Setup: OWNER_PASSWORDS isn't on this deployment yet. Add it in Vercel (tick Preview) and redeploy." }, { status: 500 });
  }
  if (!owners.some((o) => o.name === String(name || "").trim().toLowerCase())) {
    return NextResponse.json({ error: `Setup: no password saved for "${name}". Names saved: ${owners.map((o) => o.name).join(", ")}` }, { status: 401 });
  }
  const owner = checkPassword(String(name || ""), String(password || ""));
  if (!owner) {
    await new Promise((r) => setTimeout(r, 800));   // slow down guessing
    return NextResponse.json({ error: "Wrong name or password" }, { status: 401 });
  }
  const c = sessionCookie(owner);
  const res = NextResponse.json({ ok: true, owner });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

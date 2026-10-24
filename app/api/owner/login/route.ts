import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sessionCookie } from "@/lib/os/auth";

export async function POST(req: NextRequest) {
  const { name, password } = await req.json().catch(() => ({}));
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

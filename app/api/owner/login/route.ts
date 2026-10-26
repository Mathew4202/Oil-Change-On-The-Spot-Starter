import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sessionCookie, ownerList, passwordMatches } from "@/lib/os/auth";
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { cleanUsername, isRole } from "@/lib/os/roles";

type StaffRow = { username: string; role: string; pass_hash: string; active: boolean; session_ver: number };

export async function POST(req: NextRequest) {
  const { name, password, remember } = await req.json().catch(() => ({}));
  // Tell the owner exactly what's missing instead of a vague "wrong password"
  if (!process.env.ADMIN_SECRET && !process.env.OWNER_SESSION_SECRET) {
    return NextResponse.json({ error: "Setup: ADMIN_SECRET is missing on this deployment" }, { status: 500 });
  }
  const user = cleanUsername(name);
  const pw = String(password || "");
  const owners = ownerList();
  // 1) Owners (from the OWNER_PASSWORDS setting)
  if (owners.some((o) => o.name === user)) {
    const owner = checkPassword(user, pw);
    if (owner) return signIn(owner, "owner", 0, remember);
    return wrong();
  }
  // 2) Staff logins made in HQ → Team
  const [s] = user ? await sbGet<StaffRow>(`staff?select=username,role,pass_hash,active,session_ver&username=eq.${enc(user)}`).catch(() => []) : [];
  if (s && s.active && isRole(s.role) && passwordMatches(pw, s.pass_hash)) {
    await sbPatch("staff", `username=eq.${enc(user)}`, { last_login_at: new Date().toISOString() }).catch(() => null);
    return signIn(s.username, s.role, s.session_ver ?? 0, remember);
  }
  if (!owners.length && !s) {
    return NextResponse.json({ error: "Setup: OWNER_PASSWORDS isn't on this deployment. Add it in Vercel (mathew:yourpassword,harsh:hispassword), then redeploy." }, { status: 500 });
  }
  if (s && !s.active) { await slow(); return NextResponse.json({ error: "This login is turned off. Ask Mathew or Harsh." }, { status: 401 }); }
  return wrong();
}

const slow = () => new Promise((r) => setTimeout(r, 800));   // slows down guessing
async function wrong() { await slow(); return NextResponse.json({ error: "Wrong name or password" }, { status: 401 }); }

function signIn(name: string, role: "owner" | "manager" | "front_desk" | "technician", ver: number, remember: unknown) {
  const c = sessionCookie(name, remember !== false, role, ver);
  const res = NextResponse.json({ ok: true, owner: name, role });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import { checkPassword, sessionCookie, ownerList } from "@/lib/os/auth";

export async function POST(req: NextRequest) {
  const { name, password, remember } = await req.json().catch(() => ({}));
  // Tell the owner exactly what's missing instead of a vague "wrong password"
  if (!process.env.ADMIN_SECRET && !process.env.OWNER_SESSION_SECRET) {
    return NextResponse.json({ error: "Setup: ADMIN_SECRET is missing on this deployment" }, { status: 500 });
  }
  const owners = ownerList();
  if (!owners.length) {
    const raw = process.env.OWNER_PASSWORDS;
    const where = `${process.env.VERCEL_PROJECT_PRODUCTION_URL ? "" : ""}project "${process.env.VERCEL_GIT_REPO_SLUG ? (process.env.VERCEL_URL || "").split("-git-")[0] : "?"}", ${process.env.VERCEL_ENV || "unknown"} environment`;
    return NextResponse.json({ error: raw && raw.trim()
      ? `Setup: OWNER_PASSWORDS is there but not in the right format. It should look like mathew:yourpassword,harsh:hispassword (it has ${raw.trim().length} characters, no ":" found).`
      : `Setup: OWNER_PASSWORDS isn't on this deployment (${where}). Add it to this project in Vercel, tick Preview, then redeploy.` }, { status: 500 });
  }
  if (!owners.some((o) => o.name === String(name || "").trim().toLowerCase())) {
    return NextResponse.json({ error: `Setup: no password saved for "${name}". Names saved: ${owners.map((o) => o.name).join(", ")}` }, { status: 401 });
  }
  const owner = checkPassword(String(name || ""), String(password || ""));
  if (!owner) {
    await new Promise((r) => setTimeout(r, 800));   // slow down guessing
    return NextResponse.json({ error: "Wrong name or password" }, { status: 401 });
  }
  const c = sessionCookie(owner, remember !== false);
  const res = NextResponse.json({ ok: true, owner });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

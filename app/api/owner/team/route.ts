// HQ → Team (owners only, enforced by the middleware too). GET → logins · POST {action: add|update, ...}
import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "@/lib/os/auth";
import { listStaff, addStaff, updateStaff } from "@/lib/os/team";
import { ROLE_INFO } from "@/lib/os/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = currentStaff();
  if (s?.role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  return NextResponse.json({ ...(await listStaff()), roles: ROLE_INFO });
}

export async function POST(req: NextRequest) {
  const s = currentStaff();
  if (s?.role !== "owner") return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = b.action === "add" ? await addStaff(b, s.name) : b.action === "update" ? await updateStaff(b.username, b) : { ok: false as const, error: "Bad request" };
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

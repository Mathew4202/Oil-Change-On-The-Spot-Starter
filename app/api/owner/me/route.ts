// Who is signed in and what they can do (the menu and screens use this to show only their part).
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/os/auth";
import { canOf } from "@/lib/os/roles";
export const dynamic = "force-dynamic";
export async function GET() {
  const s = currentStaff();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json({ name: s.name, role: s.role, can: canOf(s.role) });
}

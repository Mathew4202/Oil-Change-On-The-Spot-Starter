// Fleet login: POST {contact} → the account's private link is texted to its phone (same answer either way).
import { NextRequest, NextResponse } from "next/server";
import { sendPortalLink } from "@/lib/os/fleet-portal";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const r = await sendPortalLink(String(b.contact || "").slice(0, 120)).catch(() => ({ ok: true as const }));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

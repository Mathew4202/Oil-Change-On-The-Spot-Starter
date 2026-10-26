// POST a fleet pricing request: saved, both owners get a notification and a push, and an email if email is set up.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { sbInsert } from "@/lib/os/db";
import { e164 } from "@/lib/os/booking";
import { pushToOwners } from "@/lib/os/push";
import { FLEET_SERVICES } from "@/lib/site/fleet";
import { emailFrom } from "@/lib/os/email-from";

export const dynamic = "force-dynamic";

const Body = z.object({
  company: z.string().trim().min(2).max(120), contactName: z.string().trim().min(2).max(80), role: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(7).max(20), email: z.string().trim().email().max(120).optional().or(z.literal("")),
  vehicles: z.number().int().min(1).max(1000).optional(), vehicleTypes: z.string().trim().max(300).optional(),
  services: z.array(z.enum(FLEET_SERVICES.map((s) => s.id) as [string, ...string[]])).max(10), howOften: z.string().trim().max(60).optional(),
  address: z.string().trim().max(200).optional(), notes: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(),   // hidden field: bots fill it in
});

const hits = new Map<string, number[]>();
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000); list.push(now); hits.set(ip, list);
  if (list.length > 5) return NextResponse.json({ error: "Too many requests. Please call or text us." }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Please fill in your company, name and phone number." }, { status: 400 });
  const b = p.data;
  if (b.phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Add a 10-digit phone number." }, { status: 400 });
  const names = b.services.map((id) => FLEET_SERVICES.find((s) => s.id === id)?.name ?? id);
  const row = await sbInsert("fleet_requests", { company: b.company, contact_name: b.contactName, role: b.role || null, phone: e164(b.phone), email: b.email || null,
    vehicles: b.vehicles ?? null, vehicle_types: b.vehicleTypes || null, services: b.services, how_often: b.howOften || null, address: b.address || null, notes: b.notes || null });
  const title = `Fleet request: ${b.company}`;
  const body = `${b.contactName}${b.role ? ` (${b.role})` : ""} · ${b.phone}${b.vehicles ? ` · ${b.vehicles} vehicles` : ""}${names.length ? ` · ${names.join(", ")}` : ""}`;
  try { await sbInsert("notifications", { kind: "fleet_request", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url: "/owner", tag: `fleet-${now}` }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
  const to = process.env.NOTIFY_TO || process.env.EMAIL_TO;
  if (process.env.RESEND_API_KEY && to) {
    const lines = [`Company: ${b.company}`, `Contact: ${b.contactName}${b.role ? `, ${b.role}` : ""}`, `Phone: ${b.phone}`, `Email: ${b.email || "-"}`,
      `Vehicles: ${b.vehicles ?? "-"}${b.vehicleTypes ? ` (${b.vehicleTypes})` : ""}`, `Services: ${names.join(", ") || "-"}`, `How often: ${b.howOften || "-"}`,
      `Where: ${b.address || "-"}`, `Notes: ${b.notes || "-"}`];
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: emailFrom(), to, replyTo: b.email || undefined,
      subject: title, text: lines.join("\n") }).catch(() => null);
  }
  if (!row.ok) return NextResponse.json({ ok: true, saved: false });   // still told you by push/email
  return NextResponse.json({ ok: true });
}

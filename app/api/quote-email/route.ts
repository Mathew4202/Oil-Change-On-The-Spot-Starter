import type { NextRequest } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isPhone(s: string) {
  return /^[0-9+()\-.\s]{7,20}$/.test(s);
}

type Row = { count: number; resetAt: number };
const RL = new Map<string, Row>();
const WINDOW_MS = 60_000;
const LIMIT = 10;
const MIN_FORM_TIME_MS = 1_500;

function ipOf(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}
function allow(ip: string) {
  const now = Date.now();
  const row = RL.get(ip);
  if (!row || row.resetAt <= now) {
    RL.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (row.count >= LIMIT) return false;
  row.count++;
  return true;
}

async function parseFormOrJson(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    const obj: Record<string, string> = {};
    fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : ""));
    return obj;
  }
  try {
    const j = await req.json();
    return j && typeof j === "object" ? (j as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const resend = new Resend(process.env.RESEND_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const ip = ipOf(req);
    if (!allow(ip)) {
      return Response.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 }
      );
    }

    const data = await parseFormOrJson(req);

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const phone = String(data.phone || "").trim();
    if (!name || !isEmail(email) || !isPhone(phone)) {
      return Response.json(
        { error: "Please enter a valid name, email, and phone." },
        { status: 400 }
      );
    }

    const company = String(data.company || "").trim();
    if (company) {
      // honeypot: pretend success
      return Response.json({ ok: true }, { status: 200 });
    }

    const ts = Number(data.ts || 0);
    if (!ts || Date.now() - ts < MIN_FORM_TIME_MS) {
      return Response.json({ error: "Invalid submission" }, { status: 400 });
    }

    const vehicle = `${data.year || ""} ${data.make || ""} ${data.model || ""} ${
      data.engine ? `(${data.engine})` : ""
    } ${data.trim ? `• ${data.trim}` : ""}`.trim();
    const when = `${data.preferred_date || ""} ${data.preferred_time || ""}`.trim();
    const address = String(data.address || "");
    const postal = String(data.postal || "");
    const outOfArea = String(data.outOfArea || "") === "true";
    const notes = String(data.notes || "");

    const priceBase = data.price_base ? `$${data.price_base}` : "—";
    const priceAdd = data.price_addons ? `$${data.price_addons}` : "$0";
    const priceTot = data.price_total ? `$${data.price_total}` : "—";
    const addonsStr = String(data.addons || "").trim();

    const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "Oil Change On The Spot";

    const businessSubject = `New quote request — ${vehicle || name}`;
    const businessHtml = `
      <div style="font:14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2 style="margin:0 0 10px">New quote request</h2>
        <p><b>Name:</b> ${name}<br/><b>Email:</b> ${email}<br/><b>Phone:</b> ${phone}</p>
        <p><b>Vehicle:</b> ${vehicle || "—"}</p>
        <p><b>Preferred:</b> ${when || "—"}</p>
        <p><b>Address:</b> ${address || "—"}</p>
        <p><b>Postal:</b> ${postal || "—"} ${
      outOfArea ? ' <span style="color:#b45309">(OUT OF AREA)</span>' : ""
    }</p>
        ${addonsStr ? `<p><b>Add-ons:</b> ${addonsStr}</p>` : ""}
        <table style="margin:10px 0;border-collapse:collapse">
          <tr><td style="padding:4px 8px;border:1px solid #e5e7eb">${priceBase}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #e5e7eb">${priceAdd}</td></tr>
          <tr><td style="padding:4px 8px;border:1px solid #e5e7eb;font-weight:600">${priceTot}</td></tr>
        </table>
        ${notes ? `<p><b>Notes:</b> ${notes}</p>` : ""}
        <hr/><p style="color:#64748b">IP: ${ip}</p>
      </div>
    `;

    const customerSubject = `We received your request — ${vehicle || ""}`;
    const customerHtml = `
      <div style="font:14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2 style="margin:0 0 10px">Thanks! We’ve received your request.</h2>
        <p>We’ll confirm your time shortly. If anything is wrong, just reply to this email.</p>
        <p><b>Your requested time:</b> ${when || "—"}</p>
        ${
          outOfArea
            ? `<p style="color:#b45309"><b>Note:</b> You appear to be outside our normal area. We’ll text you to coordinate.</p>`
            : ""
        }
        <p style="color:#64748b">— ${brand}</p>
      </div>
    `;

    if (!process.env.RESEND_API_KEY) {
      throw new Error("Email service not configured");
    }

    const from = process.env.EMAIL_FROM || "Oil Change <onboarding@resend.dev>";
    const notifyTo =
      process.env.NOTIFY_TO || process.env.EMAIL_TO || process.env.EMAIL_FROM || email;

    // Send to you
    const { error: businessError } = await resend.emails.send({
      from,
      to: notifyTo,
      subject: businessSubject,
      html: businessHtml,
    });
    if (businessError) {
      throw new Error(businessError.message || "Failed to send business email");
    }

    // Send confirmation to customer
    const { error: customerError } = await resend.emails.send({
      from,
      to: email,
      replyTo: notifyTo,
      subject: customerSubject,
      html: customerHtml,
    });
    if (customerError) {
      throw new Error(customerError.message || "Failed to send confirmation email");
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("quote-email error:", err);
    return Response.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

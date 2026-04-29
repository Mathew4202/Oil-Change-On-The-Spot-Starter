import type { NextRequest } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  if (
    ct.includes("multipart/form-data") ||
    ct.includes("application/x-www-form-urlencoded")
  ) {
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

function labelForService(service: string) {
  switch (service) {
    case "oil_change":
      return "Oil Change";
    case "tire_change":
      return "Tire Change";
    case "serpentine_belt":
      return "Serpentine Belt Replacement";
    case "spark_plugs":
      return "Spark Plug Replacement";
    case "ignition_coil":
      return "Ignition Coil Replacement";
    case "battery":
      return "Battery Test and Replacement";
    case "fluid_changes":
      return "Fluid Changes";
    default:
      return service || "Service";
  }
}

function money2(n: number) {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}
function moneyFromAny(v: unknown): string {
  if (v === null || v === undefined) return "";
  const n =
    typeof v === "number"
      ? v
      : Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return "";
  return money2(n);
}

function membershipShortFromLabel(label: string) {
  const clean = String(label || "").trim();
  if (!clean) return "";
  return clean.replace(/\s*\$\d[\d.]*.*$/g, "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const ip = ipOf(req);
    if (!allow(ip)) {
      return Response.json(
        { error: "Too many requests. Try again soon." },
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

    const honeypot = String(data.company || "").trim();
    if (honeypot) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const ts = Number(data.ts || 0);
    if (!ts || Date.now() - ts < MIN_FORM_TIME_MS) {
      return Response.json({ error: "Invalid submission" }, { status: 400 });
    }

    const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "Oil Change On The Spot";

    const outOfArea = String(data.outOfArea || "") === "true";
    const address = String(data.address || "").trim();
    const postal = String(data.postal || "").trim();

    const notes = String(data.notes || "").trim();
    const serviceIssue = String(data.service_issue || "").trim();

    const preferredDate = String(data.preferred_date || "").trim();
    const preferredTime = String(data.preferred_time || "").trim();

    const membershipPlanId = String(data.membership_plan_id || "").trim();
    const membershipPlanLabel = String(data.membership_plan_label || "").trim();
    const membershipMonthlyRaw = data.membership_monthly;
    const membershipPromoText = String(data.membership_promo_text || "").trim();
    const membershipSelected = Boolean(membershipPlanId && membershipPlanLabel);

    const fleetPlanId = String(data.fleet_plan_id || "").trim();
    const fleetPlanLabel = String(data.fleet_plan_label || "").trim();
    const fleetCountRaw = data.fleet_count;
    const fleetVehicleMonthlyRaw = data.fleet_vehicle_monthly;
    const fleetTotalMonthlyRaw = data.fleet_total_monthly;
    const fleetVehicleList = String(data.fleet_vehicle_list || "").trim();
    const companyName = String(data.company_name || "").trim();
    const fleetSelected = Boolean(fleetPlanId && fleetPlanLabel);

    const year = String(data.year || "").trim();
    const make = String(data.make || "").trim();
    const model = String(data.model || "").trim();
    const engine = String(data.engine || "").trim();
    const trim = String(data.trim || "").trim();

    const vehicle =
      `${year} ${make} ${model}`.trim() +
      (engine ? ` (${engine})` : "") +
      (trim ? ` • ${trim}` : "");

    const servicePicked = labelForService(String(data.service || "").trim());

    const discountRaw = Number(data.discount || 0);

    const priceBaseNum = moneyFromAny(data.price_base);
    const priceAddNum = moneyFromAny(data.price_addons);
    const priceTotNum = moneyFromAny(data.price_total);
    const priceDiscountNum = discountRaw > 0 ? moneyFromAny(discountRaw) : "";

    const priceSubtotalNum = moneyFromAny(data.price_subtotal);
    const priceTaxNum = moneyFromAny(data.price_tax);

    const membershipMonthlyDisplay = moneyFromAny(membershipMonthlyRaw);

    const fleetCount = Math.max(1, Math.min(999, Math.floor(Number(fleetCountRaw || 1))));
    const fleetVehicleMonthlyDisplay = moneyFromAny(fleetVehicleMonthlyRaw);
    const fleetTotalMonthlyDisplay =
      moneyFromAny(fleetTotalMonthlyRaw) ||
      money2((Number(fleetVehicleMonthlyRaw || 0) || 0) * fleetCount);

    const membershipShort = membershipShortFromLabel(membershipPlanLabel);

    const requestType = fleetSelected ? "fleet" : membershipSelected ? "membership" : "single";

    const businessSubject =
      requestType === "fleet"
        ? `New request, Fleet, ${membershipShortFromLabel(fleetPlanLabel) || "Plan selected"}`
        : requestType === "membership"
        ? `New request, Membership, ${membershipShort || "Plan selected"}`
        : `New quote request, ${servicePicked}`;

    const showServiceLine = requestType === "single";
    const showAddonsLine = requestType === "single";

    const whenLine =
      requestType === "single"
        ? `${preferredDate} ${preferredTime}`.trim()
        : preferredDate;

    const businessHtml = `
      <div style="font:14px system-ui; line-height:1.45">
        <h2>New request</h2>

        <p>
          <b>Name:</b> ${escapeHtml(name)}<br/>
          <b>Email:</b> ${escapeHtml(email)}<br/>
          <b>Phone:</b> ${escapeHtml(phone)}
        </p>

        ${
          requestType === "membership"
            ? `
              <p>
                <b>Membership:</b> ${escapeHtml(membershipPlanLabel)}<br/>
                ${membershipMonthlyDisplay ? `<b>Monthly:</b> $${escapeHtml(membershipMonthlyDisplay)}<br/>` : ""}
                ${membershipPromoText ? `<b>Promo shown on site:</b> ${escapeHtml(membershipPromoText)}` : ""}
              </p>
              <p><b>Next step:</b> Review details, then reply with the Square subscription link.</p>
            `
            : ""
        }

        ${
          requestType === "fleet"
            ? `
              <p>
                <b>Fleet:</b> ${escapeHtml(fleetPlanLabel)}<br/>
                <b>Vehicles:</b> ${fleetCount}<br/>
                ${companyName ? `<b>Company name:</b> ${escapeHtml(companyName)}<br/>` : ""}
                ${fleetVehicleMonthlyDisplay ? `<b>Per vehicle monthly:</b> $${escapeHtml(fleetVehicleMonthlyDisplay)}<br/>` : ""}
                <b>Total monthly:</b> $${escapeHtml(fleetTotalMonthlyDisplay)}
              </p>
              <p><b>Next step:</b> Review details, then reply with the Square subscription link or invoice plan.</p>
            `
            : ""
        }

        ${showServiceLine ? `<p><b>Service:</b> ${escapeHtml(servicePicked)}</p>` : ""}

        ${
          requestType === "single"
            ? `<p><b>Vehicle:</b> ${escapeHtml(vehicle || "—")}</p>`
            : vehicle.trim().length > 0
            ? `<p><b>Vehicle:</b> ${escapeHtml(vehicle)}</p>`
            : ""
        }

        ${
          requestType === "fleet"
            ? `
              <p><b>Fleet vehicle list:</b><br/>
                <span style="color:#64748b">Format expected: Year, Make, Model, Engine, Trim</span>
              </p>
              <pre style="white-space:pre-wrap; background:#0b1220; color:#e5e7eb; padding:10px; border-radius:8px; margin:0">${
                escapeHtml(fleetVehicleList || "")
              }</pre>
            `
            : ""
        }

        <p><b>${requestType === "single" ? "Preferred:" : "Preferred start date:"}</b> ${escapeHtml(whenLine || "—")}</p>

        <p><b>Address:</b> ${escapeHtml(address || "—")}</p>

        <p>
          <b>Postal:</b> ${escapeHtml(postal || "—")}
          ${outOfArea ? ' <span style="color:#b45309">(OUT OF AREA)</span>' : ""}
        </p>

        ${outOfArea ? `<p><b>Service area note:</b> Outside normal area. Follow up needed.</p>` : ""}

        ${
          showAddonsLine
            ? `<p><b>Add-ons:</b> ${escapeHtml(String(data.addons || "").trim() || "None selected")}</p>`
            : ""
        }

        ${
          requestType === "single"
            ? `
              <table style="margin-top:10px;border-collapse:collapse">
                <tr><td style="padding:6px;border:1px solid #ccc">Base: $${escapeHtml(priceBaseNum || "—")}</td></tr>
                <tr><td style="padding:6px;border:1px solid #ccc">Add-ons: $${escapeHtml(priceAddNum || "0.00")}</td></tr>
                ${
                  discountRaw > 0 && priceDiscountNum
                    ? `<tr><td style="padding:6px;border:1px solid #ccc">Discount: -$${escapeHtml(priceDiscountNum)}</td></tr>`
                    : ""
                }
                <tr><td style="padding:6px;border:1px solid #ccc">Subtotal: $${escapeHtml(priceSubtotalNum || "—")}</td></tr>
                <tr><td style="padding:6px;border:1px solid #ccc">Tax (14%): $${escapeHtml(priceTaxNum || "—")}</td></tr>
                <tr><td style="padding:6px;border:1px solid #ccc;font-weight:600">Total: $${escapeHtml(priceTotNum || "—")}</td></tr>
              </table>
            `
            : ""
        }

        ${
          requestType === "membership"
            ? `
              <p>
                <b>Pricing:</b><br/>
                Monthly: $${escapeHtml(membershipMonthlyDisplay || "—")}
              </p>
            `
            : ""
        }

        ${
          requestType === "fleet"
            ? `
              <p>
                <b>Pricing:</b><br/>
                Per vehicle monthly: $${escapeHtml(fleetVehicleMonthlyDisplay || "—")}<br/>
                Vehicles: ${fleetCount}<br/>
                Estimated monthly total: $${escapeHtml(fleetTotalMonthlyDisplay || "—")}
              </p>
            `
            : ""
        }

        ${serviceIssue ? `<p><b>What needs service:</b> ${escapeHtml(serviceIssue)}</p>` : ""}
        ${notes ? `<p><b>Notes:</b> ${escapeHtml(notes)}</p>` : ""}
      </div>
    `;

    const customerSubject =
      requestType === "fleet"
        ? "We received your fleet request"
        : requestType === "membership"
        ? "We received your membership request"
        : `We received your request, ${servicePicked}`;

    const customerHtml = `
      <div style="font:14px system-ui; line-height:1.45">
        <h2>Thanks, we received your request.</h2>

        ${
          requestType === "membership"
            ? `
              <p>
                <b>Membership selected:</b> ${escapeHtml(membershipPlanLabel)}<br/>
                ${membershipMonthlyDisplay ? `<b>Monthly:</b> $${escapeHtml(membershipMonthlyDisplay)}<br/>` : ""}
                ${membershipPromoText ? `<span style="color:#64748b">${escapeHtml(membershipPromoText)}</span>` : ""}
              </p>
              <p style="color:#0f172a"><b>Next:</b> We will review your request and get back to you soon with next steps.</p>
            `
            : ""
        }

        ${
          requestType === "fleet"
            ? `
              <p>
                <b>Fleet plan:</b> ${escapeHtml(fleetPlanLabel)}<br/>
                <b>Vehicles:</b> ${fleetCount}<br/>
                ${fleetVehicleMonthlyDisplay ? `<b>Per vehicle monthly:</b> $${escapeHtml(fleetVehicleMonthlyDisplay)}<br/>` : ""}
                <b>Estimated monthly total:</b> $${escapeHtml(fleetTotalMonthlyDisplay)}
              </p>
              <p style="color:#0f172a"><b>Next:</b> We will review your request and get back to you soon with next steps.</p>
            `
            : ""
        }

        ${
          requestType === "single"
            ? `
              <p><b>Service:</b> ${escapeHtml(servicePicked)}</p>
              <p><b>Add-ons:</b> ${escapeHtml(String(data.addons || "").trim() || "None selected")}</p>
              <p><b>Your vehicle:</b> ${escapeHtml(vehicle || "—")}</p>
              <p><b>Your time:</b> ${escapeHtml(`${preferredDate} ${preferredTime}`.trim() || "—")}</p>

              <p>
                <b>Pricing:</b><br/>
                Base: $${escapeHtml(priceBaseNum || "—")}<br/>
                Add-ons: $${escapeHtml(priceAddNum || "0.00")}<br/>
                ${
                  discountRaw > 0 && priceDiscountNum
                    ? `Discount: -$${escapeHtml(priceDiscountNum)}<br/>`
                    : ""
                }
                Subtotal: $${escapeHtml(priceSubtotalNum || "—")}<br/>
                Tax (14%): $${escapeHtml(priceTaxNum || "—")}<br/>
                Total: $${escapeHtml(priceTotNum || "—")}
              </p>
            `
            : ""
        }

        ${
          requestType !== "single"
            ? `
              ${vehicle.trim() ? `<p><b>Your vehicle:</b> ${escapeHtml(vehicle)}</p>` : ""}
              <p><b>Preferred start date:</b> ${escapeHtml(preferredDate || "—")}</p>
            `
            : ""
        }

        ${serviceIssue ? `<p><b>What needs service:</b> ${escapeHtml(serviceIssue)}</p>` : ""}
        ${notes ? `<p><b>Notes:</b> ${escapeHtml(notes)}</p>` : ""}

        ${outOfArea ? `<p style="color:#b45309"><b>Note:</b> Outside our normal area. We will follow up.</p>` : ""}

        <p style="color:#64748b">${escapeHtml(brand)}</p>
      </div>
    `;

    if (!process.env.RESEND_API_KEY) {
      throw new Error("Email service not configured");
    }

    const from = process.env.EMAIL_FROM || "Oil Change <onboarding@resend.dev>";

    const notifyTo = process.env.NOTIFY_TO || process.env.EMAIL_TO || "";
    if (!notifyTo) {
      throw new Error("NOTIFY_TO is missing. Set NOTIFY_TO to your business inbox.");
    }

    await resend.emails.send({
      from,
      to: notifyTo,
      subject: businessSubject,
      html: businessHtml,
    });

    await resend.emails.send({
      from,
      to: email,
      replyTo: notifyTo,
      subject: customerSubject,
      html: customerHtml,
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("quote-email error:", err);
    return Response.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
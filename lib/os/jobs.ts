// The job screen: start, finish (record the work), take payment, update stock, email the receipt.
import crypto from "crypto";
import { Resend } from "resend";
import { sbGet, sbInsert, sbPatch, sbRpc, enc } from "@/lib/os/db";
import { oilCostPerL } from "@/lib/os/pricing-engine";
import { receiptHtml, receiptText, type ReceiptData } from "@/lib/os/receipt";
import { sendSms, template, fill, reviewLink } from "@/lib/os/sms";

const r2 = (x: number) => Math.round(x * 100) / 100;
const TZ = "America/Halifax";
const nice = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });

export type JobContext = {
  booking: { id: string; status: string; starts_at: string; address: string | null; pay_mode: string; quoted_total: number | null;
    quote_breakdown: { lines?: { label: string; amount: number }[]; subtotal?: number; hst?: number; total?: number } | null;
    services: { job?: string; addons?: string[]; own?: string | null } | null; cars: number; notes: string | null; paid_at: string | null;
    customer_id: string | null; vehicle_id: string | null };
  customer: { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; review_asked_at: string | null } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; engine: string | null; last_km: number | null; vin: string | null;
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null } | null } | null;
  job: Record<string, unknown> | null;
};

export async function jobContext(bookingId: string): Promise<JobContext | null> {
  const id = enc(bookingId);
  const [b] = await sbGet<JobContext["booking"]>(`bookings?select=id,status,starts_at,address,pay_mode,quoted_total,quote_breakdown,services,cars,notes,paid_at,customer_id,vehicle_id&id=eq.${id}`);
  if (!b) return null;
  const [[customer], [vehicle], [job]] = await Promise.all([
    b.customer_id ? sbGet<NonNullable<JobContext["customer"]>>(`customers?select=id,first_name,last_name,phone,email,review_asked_at&id=eq.${b.customer_id}`) : Promise.resolve([null]),
    b.vehicle_id ? sbGet<NonNullable<JobContext["vehicle"]>>(`vehicles?select=id,year,make,model,engine,last_km,vin,vehicle_specs(oil_grade,capacity_l,oil_filter_part,oil_spec)&id=eq.${b.vehicle_id}`) : Promise.resolve([null]),
    sbGet<Record<string, unknown>>(`jobs?select=*&booking_id=eq.${id}&order=done_at.desc&limit=1`),
  ]);
  return { booking: b, customer: customer ?? null, vehicle: vehicle ?? null, job: job ?? null };
}

export async function startJob(bookingId: string) {
  return sbPatch("bookings", `id=eq.${enc(bookingId)}`, { status: "in_progress", started_at: new Date().toISOString() });
}

export type FinishInput = {
  bookingId: string;
  km?: number | null;
  vin?: string | null;
  oilGrade?: string | null; oilLitres?: number | null; filterPart?: string | null;
  inspection?: Record<string, { status: "ok" | "soon" | "now"; note?: string }>;
  extraLines?: { label: string; amount: number }[];     // things added on site (negative = discount)
  doneBy?: "both" | "mathew" | "harsh";
  notes?: string;
  payMethod?: "card_terminal" | "cash" | "etransfer" | "card_online" | null;   // null = not paid yet
  email?: string | null;
  sendReceipt?: boolean;
};

export async function finishJob(input: FinishInput, owner: string) {
  const ctx = await jobContext(input.bookingId);
  if (!ctx) return { ok: false as const, error: "Booking not found" };
  if (ctx.job) return { ok: false as const, error: "This job is already finished" };
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  const hstRate = Number(rules.hst_rate ?? 0.14);

  // What we charge: the booked lines plus anything added on site
  const booked = ctx.booking.quote_breakdown?.lines ?? [];
  const extras = (input.extraLines ?? []).filter((l) => l.label?.trim() && Number.isFinite(l.amount)).map((l) => ({ label: l.label.trim().slice(0, 80), amount: r2(l.amount) }));
  const lines = [...booked, ...extras];
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  const hst = r2(subtotal * hstRate);
  const total = r2(subtotal + hst);

  // What it cost us
  const spec = ctx.vehicle?.vehicle_specs;
  const own = ctx.booking.services?.own;
  const withOil = !ctx.booking.services?.job || ["oil_change", "seasonal"].includes(ctx.booking.services.job);
  const grade = input.oilGrade || spec?.oil_grade || null;
  const litres = input.oilLitres ?? (spec ? Number(spec.capacity_l) * (ctx.booking.cars || 1) : null);
  const filterPart = input.filterPart ?? spec?.oil_filter_part ?? null;
  let costOil = 0, costParts = 0;
  if (withOil && grade && litres && own !== "both" && own !== "oil") {
    const prices = Object.fromEntries((await sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l")).map((o) => [o.grade, Number(o.cost_per_l)]));
    costOil = r2((oilCostPerL(grade, prices) ?? 0) * litres);
  }
  let filterId: string | null = null, filterOnHand = 0;
  if (withOil && filterPart && own !== "both" && own !== "filter") {
    const [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(filterPart)}&limit=1`);
    filterId = p?.id ?? null; filterOnHand = Number(p?.on_hand ?? 0);
    const [q] = filterId ? await sbGet<{ our_cost: number }>(`part_quotes?select=our_cost&part_id=eq.${filterId}&order=checked_at.desc&limit=1`) : [];
    costParts = r2(Number(q?.our_cost ?? rules.filter_estimate ?? 6.5) * (ctx.booking.cars || 1));
  }

  // Next oil change
  const km = input.km && input.km > 0 ? Math.round(input.km) : null;
  const nextKm = km && withOil ? km + (rules.oil_interval_km ?? 8000) : null;
  const due = new Date(); due.setMonth(due.getMonth() + (rules.oil_interval_months ?? 6));
  const nextDate = withOil ? due.toISOString().slice(0, 10) : null;

  // First-time customers get the review request (text now, and on their receipt)
  const firstTime = !!ctx.customer && !ctx.customer.review_asked_at;
  const receiptNo = await sbRpc<number>("next_receipt_no");
  const token = crypto.randomBytes(18).toString("base64url");
  const now = new Date().toISOString();
  const carText = ctx.vehicle ? [ctx.vehicle.year, ctx.vehicle.make, ctx.vehicle.model].filter(Boolean).join(" ") : null;

  const job = await sbInsert<{ id: string }>("jobs", {
    booking_id: ctx.booking.id, vehicle_id: ctx.vehicle?.id ?? null, customer_id: ctx.customer?.id ?? null,
    done_at: now, km, oil_grade: withOil ? grade : null, oil_litres: withOil ? litres : null, filter_part: withOil ? filterPart : null,
    revenue: subtotal, cost_oil: costOil, cost_parts: costParts, cost_other: withOil ? (rules.consumables ?? 1) : 0,
    inspection: input.inspection ?? null, next_due_km: nextKm, next_due_date: nextDate,
    service: ctx.booking.services?.job ?? "oil_change", payment_method: input.payMethod ?? null, done_by: input.doneBy ?? "both",
    notes: input.notes?.slice(0, 1000) || null, vehicle_text: carText,
    receipt_no: receiptNo, receipt_token: token, lines, subtotal, hst, total,
    review_requested: firstTime,
  });
  if (!job.ok) return { ok: false as const, error: `Couldn't save the job: ${JSON.stringify(job.error)}` };

  await sbPatch("bookings", `id=eq.${ctx.booking.id}`, { status: "done", finished_at: now });
  const vin = (input.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (ctx.vehicle && (km || vin)) await sbPatch("vehicles", `id=eq.${ctx.vehicle.id}`, { ...(km ? { last_km: km } : {}), ...(vin.length === 17 ? { vin } : {}) });
  if (input.email && ctx.customer && !ctx.customer.email) await sbPatch("customers", `id=eq.${ctx.customer.id}`, { email: input.email.trim().toLowerCase() });

  // Stock: one filter per car comes off the shelf if we had it
  if (filterId && filterOnHand > 0) {
    const used = Math.min(filterOnHand, ctx.booking.cars || 1);
    await sbPatch("parts", `id=eq.${filterId}`, { on_hand: filterOnHand - used });
    await sbInsert("stock_moves", { part_id: filterId, qty: -used, reason: "job", job_id: job.data!.id });
  }

  if (input.payMethod) await recordPayment(ctx.booking.id, total, input.payMethod, owner);

  // Review text goes out as soon as the job is complete
  let reviewText: { sent: boolean; status: string } | null = null;
  if (firstTime && ctx.customer?.phone) {
    const body = await template("review_request");
    if (body) {
      reviewText = await sendSms(ctx.customer.phone, fill(body, { first_name: ctx.customer.first_name?.trim() || "there", review_link: await reviewLink() }),
        { kind: "review_request", customerId: ctx.customer.id, bookingId: ctx.booking.id });
    }
  }
  if (firstTime && ctx.customer) await sbPatch("customers", `id=eq.${ctx.customer.id}`, { review_asked_at: now });

  // The receipt goes out once they've paid (if not paid yet, it's sent when you mark it paid)
  let receipt: { sent: boolean; reason?: string } = { sent: false, reason: input.payMethod ? "not requested" : "waiting for payment" };
  if (input.payMethod && input.sendReceipt !== false) receipt = await sendReceipt(job.data!.id, input.email ?? null);
  return { ok: true as const, jobId: job.data!.id, receiptNo, total, receipt, reviewText, profit: r2(subtotal - costOil - costParts - (withOil ? rules.consumables ?? 1 : 0)) };
}

export async function recordPayment(bookingId: string, amount: number, method: string, owner: string) {
  await sbInsert("payments", { booking_id: bookingId, amount, method, processor_ref: `recorded by ${owner}` });
  await sbPatch("bookings", `id=eq.${enc(bookingId)}`, { paid_at: new Date().toISOString() });
  await sbPatch("jobs", `booking_id=eq.${enc(bookingId)}`, { payment_method: method });
}

const siteUrl = () => process.env.SITE_URL || (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://oilchangeonthespot.ca");

export async function receiptFor(where: string): Promise<{ data: ReceiptData; jobId: string; email: string | null; customerId: string | null; reviewAsked: boolean } | null> {
  const [j] = await sbGet<{ id: string; receipt_no: number; receipt_token: string; done_at: string; lines: { label: string; amount: number }[];
    subtotal: number; hst: number; total: number; payment_method: string | null; km: number | null; next_due_km: number | null; next_due_date: string | null;
    oil_grade: string | null; oil_litres: number | null; vehicle_text: string | null; customer_id: string | null; booking_id: string | null;
    filter_part: string | null; vehicle_id: string | null; review_requested: boolean | null }>(`jobs?select=*&${where}&limit=1`);
  if (!j) return null;
  const [c] = j.customer_id ? await sbGet<{ first_name: string | null; last_name: string | null; email: string | null; review_asked_at: string | null }>(
    `customers?select=first_name,last_name,email,review_asked_at&id=eq.${j.customer_id}`) : [];
  const [b] = j.booking_id ? await sbGet<{ address: string | null }>(`bookings?select=address&id=eq.${j.booking_id}`) : [];
  const [v] = j.vehicle_id ? await sbGet<{ vin: string | null; vehicle_specs: { oil_spec: string | null } | null }>(`vehicles?select=vin,vehicle_specs(oil_spec)&id=eq.${j.vehicle_id}`) : [];
  const [fp] = j.filter_part ? await sbGet<{ brand: string | null }>(`parts?select=brand&part_number=eq.${enc(j.filter_part)}&limit=1`) : [];
  const spec = v?.vehicle_specs?.oil_spec && !/^API\s*S/i.test(v.vehicle_specs.oil_spec) ? v.vehicle_specs.oil_spec : null;
  return {
    jobId: j.id, email: c?.email ?? null, customerId: j.customer_id, reviewAsked: !!c?.review_asked_at,
    data: {
      receiptNo: j.receipt_no, date: nice(new Date(j.done_at)), customer: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Customer",
      car: j.vehicle_text || "", address: b?.address ?? null, lines: j.lines ?? [], subtotal: Number(j.subtotal), hst: Number(j.hst), total: Number(j.total),
      paidWith: j.payment_method, km: j.km, nextDueKm: j.next_due_km, nextDueDate: j.next_due_date ? nice(new Date(`${j.next_due_date}T12:00:00Z`)) : null,
      oil: j.oil_grade ? `${j.oil_grade.replace(/^Euro /, "")} full synthetic${spec ? ` (meets ${spec})` : ""}${j.oil_litres ? `, ${Number(j.oil_litres)} L` : ""}` : null,
      filter: j.filter_part ? `${fp?.brand || "NAPA ProFormer"} ${j.filter_part}` : null,
      vin: v?.vin ?? null,
      receiptUrl: `${siteUrl()}/receipt/${j.receipt_token}`,
      logoUrl: `${siteUrl()}/email-logo.png`,
      reviewUrl: j.review_requested ? await reviewLink() : null,
    },
  };
}

/** Email the receipt. (The review request is its own message, sent separately.) */
export async function sendReceipt(jobId: string, emailOverride: string | null): Promise<{ sent: boolean; reason?: string }> {
  const r = await receiptFor(`id=eq.${enc(jobId)}`);
  if (!r) return { sent: false, reason: "job not found" };
  const to = (emailOverride || r.email || "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, reason: "no email on file" };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "email service not set up" };
  const data = r.data;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM || "Oil Change On The Spot <onboarding@resend.dev>",
      to, replyTo: process.env.NOTIFY_TO || process.env.EMAIL_TO || undefined,
      subject: `Your receipt from Oil Change On The Spot (#${data.receiptNo})`,
      html: receiptHtml(data), text: receiptText(data),
    });
  } catch (e) { return { sent: false, reason: String(e).slice(0, 120) }; }
  await sbPatch("jobs", `id=eq.${r.jobId}`, { receipt_sent_at: new Date().toISOString() });
  return { sent: true };
}

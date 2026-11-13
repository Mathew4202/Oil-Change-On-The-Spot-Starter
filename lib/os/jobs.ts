// The job screen: start, finish (record the work), take payment, update stock, email the receipt.
import { checksFrom } from "@/lib/os/fleet-math";
import { chargedAddons, normPart, ADDON_COST_DEFAULT, TOPUP_L } from "@/lib/os/addon-needs";
import crypto from "crypto";
import { Resend } from "resend";
import { sbGet, sbInsert, sbPatch, sbRpc, enc } from "@/lib/os/db";
import { oilCostPerL } from "@/lib/os/pricing-engine";
import { receiptHtml, receiptText, type ReceiptData } from "@/lib/os/receipt";
import { sendSms, template, fill, reviewLink } from "@/lib/os/sms";
import { emailFrom } from "@/lib/os/email-from";
import { learnFromJob } from "@/lib/os/spec-learn";
import { textCustomer, payLink } from "@/lib/os/customer-texts";
import { lateRules, lateTerms, owing } from "@/lib/os/bill-late";
const dueText = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
import { rewardReferrer, ensureRefCode, refLink } from "@/lib/os/referrals";

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
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null; oil_spec?: string | null; engine?: string | null; fuel?: string | null; wix_filter?: string | null; cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null } | null } | null;
  job: Record<string, unknown> | null;
  paid: number;   // all payments on this booking so far (a booking paid online when booked, tips included)
  group?: { cars: { bookingId: string; car: string; done: boolean }[]; index: number; open: number; othersOwed: number; othersTotal: number; allTotal: number; allOwed: number } | null;   // several cars, one visit
  planId?: string | null;   // an active maintenance plan: parts can go on the next monthly bill
};

/** Several cars booked together (one visit): every booking in it, its job once finished, and what's been paid on it. Empty for a single car or a fleet visit. */
export type VisitCar = { bookingId: string; status: string; car: string; paid: number;
  job: { id: string; total: number; tip: number | null; late_fee: number | null; late_interest: number | null; receipt_token: string; receipt_no: number;
    lines: { label: string; amount: number }[] | null; subtotal: number; hst: number; vehicle_text: string | null; oil_grade: string | null; oil_litres: number | null; filter_part: string | null; review_requested: boolean | null; customer_note?: string | null;
    km?: number | null; next_due_km?: number | null; next_due_date?: string | null; inspection?: Record<string, { status?: string }> | null; vehicle_id?: string | null } | null };
export async function visitGroup(bookingId: string): Promise<VisitCar[]> {
  const [me] = await sbGet<{ group_id: string | null; pay_mode: string }>(`bookings?select=group_id,pay_mode&id=eq.${enc(bookingId)}`).catch(() => []);
  if (!me?.group_id || me.pay_mode === "fleet_invoice") return [];
  const rows = await sbGet<{ id: string; status: string; vehicles: { year: number | null; make: string | null; model: string | null } | null; jobs: NonNullable<VisitCar["job"]>[] }>(
    `bookings?select=id,status,vehicles(year,make,model),jobs(*)&group_id=eq.${me.group_id}&status=not.in.(cancelled,no_show)&order=starts_at`);
  if (rows.length < 2) return [];
  const pays = await sbGet<{ booking_id: string; amount: number }>(`payments?select=booking_id,amount&booking_id=in.(${rows.map((r) => r.id).join(",")})`);
  return rows.map((r) => ({ bookingId: r.id, status: r.status, car: [r.vehicles?.year, r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" ") || "Car",
    paid: r2(pays.filter((p) => p.booking_id === r.id).reduce((t, p) => t + Number(p.amount), 0)), job: r.jobs?.[0] ?? null }));
}
/** What's still owed on one finished car of a visit (late charges in, tips out). */
export const owedOn = (c: VisitCar) => !c.job ? 0 : Math.max(0, r2(Number(c.job.total) + Number(c.job.late_fee ?? 0) + Number(c.job.late_interest ?? 0) - (c.paid - Number(c.job.tip ?? 0))));

export async function jobContext(bookingId: string): Promise<JobContext | null> {
  const id = enc(bookingId);
  const [b] = await sbGet<JobContext["booking"]>(`bookings?select=id,status,starts_at,address,pay_mode,quoted_total,quote_breakdown,services,cars,notes,paid_at,customer_id,vehicle_id&id=eq.${id}`);
  if (!b) return null;
  const [[customer], [vehicle], [job], pays] = await Promise.all([
    b.customer_id ? sbGet<NonNullable<JobContext["customer"]>>(`customers?select=id,first_name,last_name,phone,email,review_asked_at&id=eq.${b.customer_id}`) : Promise.resolve([null]),
    b.vehicle_id ? sbGet<NonNullable<JobContext["vehicle"]>>(`vehicles?select=id,year,make,model,engine,last_km,vin,vehicle_specs(oil_grade,capacity_l,oil_filter_part,oil_spec,engine,fuel,wix_filter,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger)&id=eq.${b.vehicle_id}`) : Promise.resolve([null]),
    sbGet<Record<string, unknown>>(`jobs?select=*&booking_id=eq.${id}&order=done_at.desc&limit=1`),
    sbGet<{ amount: number }>(`payments?select=amount&booking_id=eq.${id}`),
  ]);
  const g = await visitGroup(bookingId).catch(() => [] as VisitCar[]);
  const others = g.filter((c) => c.bookingId !== bookingId);
  const group = g.length ? {
    cars: g.map((c) => ({ bookingId: c.bookingId, car: c.car, done: !!c.job })), index: g.findIndex((c) => c.bookingId === bookingId),
    open: others.filter((c) => !c.job).length, othersOwed: r2(others.reduce((t, c) => t + owedOn(c), 0)), othersTotal: r2(others.reduce((t, c) => t + Number(c.job?.total ?? 0), 0)),
    allTotal: r2(g.reduce((t, c) => t + Number(c.job?.total ?? 0), 0)), allOwed: r2(g.reduce((t, c) => t + owedOn(c), 0)),
  } : null;
  // on a maintenance plan: parts can go on their next monthly bill instead of being paid now
  const [plan] = b.customer_id ? await sbGet<{ id: string }>(`plans?select=id&customer_id=eq.${b.customer_id}&status=eq.active&limit=1`).catch(() => []) : [];
  return { booking: b, customer: customer ?? null, vehicle: vehicle ?? null, job: job ?? null, paid: r2(pays.reduce((t, p) => t + Number(p.amount), 0)), group, planId: plan?.id ?? null };
}

export async function startJob(bookingId: string) {
  // one visit with several cars: starting it starts them all
  const ids = [bookingId, ...(await visitGroup(bookingId).catch(() => [] as VisitCar[])).filter((c) => c.bookingId !== bookingId && ["confirmed", "requested"].includes(c.status)).map((c) => c.bookingId)];
  return sbPatch("bookings", `id=in.(${ids.map(enc).join(",")})&status=in.(confirmed,requested)`, { status: "in_progress", started_at: new Date().toISOString() });
}

export type FinishInput = {
  bookingId: string;
  km?: number | null;
  vin?: string | null;
  oilGrade?: string | null; oilLitres?: number | null; filterPart?: string | null;
  inspection?: Record<string, { status: "ok" | "soon" | "now"; note?: string }>;
  extraLines?: { label: string; amount: number }[];     // things added on site (negative = discount)
  doneBy?: string;   // "both", "mathew", "harsh", or a staff login
  notes?: string;
  customerNote?: string;   // shows on their receipt ("front tires are getting low")
  payMethod?: "card_terminal" | "cash" | "etransfer" | "card_online" | null;   // null = not paid yet
  tip?: number | null;                                                          // no HST on tips
  email?: string | null;
  sendReceipt?: boolean;
  bill?: boolean;   // they'll pay later: receipt with a Pay button by email, pay link by text
  planBill?: boolean;   // maintenance plan: what's owed goes on their next monthly bill
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
  if (!lines.length) return { ok: false as const, error: "Add what you charged before finishing" };
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  const hst = r2(subtotal * hstRate);
  const total = r2(subtotal + hst);

  // What it cost us
  const spec = ctx.vehicle?.vehicle_specs;
  const own = ctx.booking.services?.own;
  const withOil = !ctx.booking.services?.job || ["oil_change", "seasonal"].includes(ctx.booking.services.job);
  const grade = input.oilGrade || spec?.oil_grade || null;
  const litres = input.oilLitres ?? (spec ? Number(spec.capacity_l) * (ctx.booking.cars || 1) : null);
  // typed the way receipts save it: "ppf 2100290 " → "2100290"
  const cleanPart = (x: string | null | undefined) => (x ? x.toUpperCase().trim().replace(/^(PPF|NAPA|PFG)\s*/, "").replace(/\s+/g, "") || null : null);
  const filterPart = cleanPart(input.filterPart) ?? spec?.oil_filter_part ?? null;
  let costOil = 0, costParts = 0;
  if (withOil && grade && litres && own !== "both" && own !== "oil") {
    const prices = Object.fromEntries((await sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l")).map((o) => [o.grade, Number(o.cost_per_l)]));
    costOil = r2((oilCostPerL(grade, prices) ?? 0) * litres);
  }
  let filterId: string | null = null, filterOnHand = 0;
  if (withOil && filterPart && own !== "both" && own !== "filter") {
    let [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(filterPart)}&order=on_hand.desc&limit=1`);
    // none left of that number: take it from a filter linked as the same part (Parts Source vs NAPA)
    if (!p || Number(p.on_hand) < (ctx.booking.cars || 1)) {
      const { loadLinks, sameParts } = await import("@/lib/os/part-alias");
      const alts = sameParts(filterPart, await loadLinks()).slice(1);
      for (const alt of alts) {
        const [q] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(alt)}&order=on_hand.desc&limit=1`).catch(() => []);
        if (q && Number(q.on_hand) >= 1) { p = q; break; }
      }
    }
    filterId = p?.id ?? null; filterOnHand = Number(p?.on_hand ?? 0);
    const [q] = filterId ? await sbGet<{ our_cost: number }>(`part_quotes?select=our_cost&part_id=eq.${filterId}&order=checked_at.desc&limit=1`) : [];
    costParts = r2(Number(q?.our_cost ?? rules.filter_estimate ?? 6.5) * (ctx.booking.cars || 1));
  }
  // the add-on parts we charged for (cabin filter, air filter, wipers, battery): what we paid for that part number
  // if we have a price for it (matched loosely, "FIL 26195" = "26195"), otherwise the usual cost from the price settings
  const partFor: Record<string, string | null | undefined> = { cabin_filter: spec?.cabin_filter_part, engine_filter: spec?.air_filter_part };
  const charged = chargedAddons(lines, ctx.booking.services?.addons, ctx.booking.cars || 1);
  const quotes = charged.some((c) => partFor[c.kind]) ? await sbGet<{ our_cost: number | null; parts: { part_number: string } | null }>(
    "part_quotes?select=our_cost,parts!inner(part_number)&our_cost=not.is.null&order=checked_at.desc&limit=2000").catch(() => []) : [];
  for (const { kind, times } of charged) {
    if (kind === "washer_fluid" || kind === "coolant") {   // top-ups: the litres used at what a litre cost us
      const litres = topupLitres(kind, rules) * times;
      const [q] = await sbGet<{ our_cost: number }>(`part_quotes?select=our_cost,parts!inner(part_number)&parts.part_number=eq.${kind === "coolant" ? "COOLANT" : "WASHER-FLUID"}&order=checked_at.desc&limit=1`).catch(() => []);
      costParts = r2(costParts + (q ? Number(q.our_cost) * litres : (rules[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times));
      continue;
    }
    const pn = partFor[kind];
    const q = pn ? quotes.find((x) => x.parts && normPart(x.parts.part_number) === normPart(pn)) : undefined;
    costParts = r2(costParts + (q ? Number(q.our_cost) : rules[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times);
  }

  // Next oil change
  const km = input.km && input.km > 0 ? Math.round(input.km) : null;
  const nextKm = km && withOil ? km + (rules.oil_interval_km ?? 8000) : null;
  const due = new Date(); due.setMonth(due.getMonth() + (rules.oil_interval_months ?? 6));
  const nextDate = withOil ? due.toISOString().slice(0, 10) : null;

  // First-time customers get the review request (text now, and on their receipt)
  const fleet = ctx.booking.pay_mode === "fleet_invoice";   // fleet vehicle: billed on the fleet's invoice, no review text or receipt email
  const firstTime = !fleet && !!ctx.customer && !ctx.customer.review_asked_at;
  const receiptNo = await sbRpc<number>("next_receipt_no");
  const token = crypto.randomBytes(18).toString("base64url");
  const now = new Date().toISOString();
  const carText = ctx.vehicle ? [ctx.vehicle.year, ctx.vehicle.make, ctx.vehicle.model].filter(Boolean).join(" ") : null;

  const jobRow = {
    booking_id: ctx.booking.id, vehicle_id: ctx.vehicle?.id ?? null, customer_id: ctx.customer?.id ?? null,
    done_at: now, km, oil_grade: withOil ? grade : null, oil_litres: withOil ? litres : null, filter_part: withOil ? filterPart : null,
    revenue: subtotal, cost_oil: costOil, cost_parts: costParts, cost_other: withOil ? (rules.consumables ?? 1) : 0,
    inspection: withOil ? input.inspection ?? null : null, next_due_km: nextKm, next_due_date: nextDate,
    service: ctx.booking.services?.job ?? "oil_change", payment_method: input.payMethod ?? null, done_by: input.doneBy ?? "both",
    notes: input.notes?.slice(0, 1000) || null, vehicle_text: carText,
    receipt_no: receiptNo, receipt_token: token, lines, subtotal, hst, total,
    review_requested: firstTime,
  };
  const note = input.customerNote?.trim().slice(0, 600) || null;
  let job = await sbInsert<{ id: string }>("jobs", { ...jobRow, ...(note ? { customer_note: note } : {}) });
  if (!job.ok && note) job = await sbInsert<{ id: string }>("jobs", { ...jobRow, notes: [jobRow.notes, `For the customer: ${note}`].filter(Boolean).join("\n") });   // migration 0046 not run yet
  if (!job.ok) return { ok: false as const, error: `Couldn't save the job: ${JSON.stringify(job.error)}` };

  await sbPatch("bookings", `id=eq.${ctx.booking.id}`, { status: "done", finished_at: now });
  // what we used becomes this car's (and engine's) spec for next time
  // their first visit: whoever referred them gets their $5 credit (and a text)
  if (!fleet && ctx.customer) await rewardReferrer(ctx.customer.id).catch(() => null);
  // The car's engine: what's on file, else from the VIN (free NHTSA decoder), else the spec we looked up. Kept on the car.
  const vin = (input.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  let engine = ctx.vehicle?.engine || null;
  if (ctx.vehicle && !engine && vin.length === 17) {
    const { decodeVin } = await import("@/lib/os/vin-photo");
    const d = await decodeVin(vin).catch(() => null);
    if (d?.engineL) engine = `${d.engineL}L${d.cylinders ? ` ${d.cylinders}-cyl` : ""}`;
  }
  if (ctx.vehicle && !engine) engine = spec?.engine || null;
  if (ctx.vehicle && (km || vin || (engine && !ctx.vehicle.engine)))
    await sbPatch("vehicles", `id=eq.${ctx.vehicle.id}`, { ...(km ? { last_km: km } : {}), ...(vin.length === 17 ? { vin } : {}), ...(engine && !ctx.vehicle.engine ? { engine } : {}) });
  const learned = withOil && ctx.vehicle && own !== "both" ? await learnFromJob({ ...ctx.vehicle, engine }, { grade, litres, filter: filterPart, cars: ctx.booking.cars || 1 }).catch(() => null) : undefined;
  if (input.email && ctx.customer && !ctx.customer.email) await sbPatch("customers", `id=eq.${ctx.customer.id}`, { email: input.email.trim().toLowerCase() });

  // Stock: the filter and the oil we used come off the shelf (never below zero). Say what didn't, so it's never a silent miss.
  const stock: string[] = [];
  if (learned === null && withOil && ctx.vehicle) stock.push(!grade || !litres ? "Oil not saved for this car (type the oil and litres next time)" : "Couldn't save the oil for this car");
  if (withOil && filterPart && own !== "both" && own !== "filter") {
    if (filterId && filterOnHand > 0) {
      const used = Math.min(filterOnHand, ctx.booking.cars || 1);
      await sbPatch("parts", `id=eq.${filterId}`, { on_hand: filterOnHand - used });
      await sbInsert("stock_moves", { part_id: filterId, qty: -used, reason: "job", job_id: job.data!.id });
      stock.push(`Filter ${filterPart}: ${filterOnHand - used} left`);
    } else stock.push(filterId ? `Filter ${filterPart} was at 0 in Stock, so nothing came off (snap the NAPA receipt to add it)` : `Filter ${filterPart} isn't in Stock yet (snap the NAPA receipt to add it)`);
  }
  if (withOil && grade && litres && own !== "both" && own !== "oil") {
    const pn = `OIL-${grade.replace(/^Euro /i, "").toUpperCase()}`;
    const [o] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${enc(pn)}&order=on_hand.desc&limit=1`).catch(() => []);
    if (o && Number(o.on_hand) > 0) {
      const used = r2(Math.min(Number(o.on_hand), litres));
      await sbPatch("parts", `id=eq.${o.id}`, { on_hand: r2(Number(o.on_hand) - used) });
      await sbInsert("stock_moves", { part_id: o.id, qty: -used, reason: "job", job_id: job.data!.id });
      stock.push(`${grade}: ${r2(Number(o.on_hand) - used)} L left`);
    } else stock.push(`${grade} oil isn't in Stock (or is at 0), so nothing came off`);
  }

  // The add-on parts we charged for come off the shelf too (cabin and air filters by part #, wipers by size)
  await takeAddonParts(lines, ctx.booking.services?.addons, ctx.booking.cars || 1, spec, job.data!.id, stock, rules).catch(() => null);

  // Gloves and shop towels used on every car (pricing rules: gloves_per_car 2, gloves_per_box 100, towels_per_car 2)
  await useSupplies(ctx.booking.cars || 1, rules, job.data!.id).catch(() => null);

  // Several cars on one visit: payment, the bill, the receipt and the review text come once, after the last car
  const visit = fleet ? [] : await visitGroup(ctx.booking.id).catch(() => [] as VisitCar[]);
  const others = visit.filter((c) => c.bookingId !== ctx.booking.id);
  const nextCar = others.find((c) => !c.job);
  if (nextCar) return { ok: true as const, jobId: job.data!.id, receiptNo, total, prepaid: 0, refund: 0, receipt: { sent: false, reason: "after the last car" }, reviewText: null, billText: null,
    profit: r2(subtotal - costOil - costParts - (withOil ? rules.consumables ?? 1 : 0)), stock, partial: true, nextBookingId: nextCar.bookingId, nextCar: nextCar.car, carsLeft: others.filter((c) => !c.job).length };
  const othersOwed = r2(others.reduce((t, c) => t + owedOn(c), 0));

  // Paid online when they booked? Only the difference (if anything was added on site) is still owed.
  const prepaid = r2((await sbGet<{ amount: number }>(`payments?select=amount&booking_id=eq.${ctx.booking.id}`)).reduce((t, p) => t + Number(p.amount), 0));
  const tip = input.tip ?? 0;
  let paidNow = !!input.payMethod, refund = 0;
  if (prepaid > 0) {
    const balance = r2(total - prepaid);
    if (balance > 0.009) {
      if (input.payMethod && input.payMethod !== "card_online") await recordPayment(ctx.booking.id, balance, input.payMethod, owner, tip);
      else paidNow = false;   // still owes the balance: mark it paid later or send a pay link
    } else {
      refund = r2(-balance);
      if (tip > 0) await recordPayment(ctx.booking.id, 0, input.payMethod && input.payMethod !== "card_online" ? input.payMethod : "cash", owner, tip);
      await sbPatch("jobs", `id=eq.${job.data!.id}`, { payment_method: "card_online" });
      paidNow = true;
    }
  } else if (input.payMethod) await recordPayment(ctx.booking.id, total, input.payMethod, owner, tip);
  // the other cars of the visit are paid the same way, with this one
  if (input.payMethod && input.payMethod !== "card_online") for (const c of others) { const o = owedOn(c); if (o > 0) await recordPayment(c.bookingId, o, input.payMethod, owner, 0); }
  else if (others.length && othersOwed > 0) paidNow = false;

  // The thank-you / review text goes out once they've paid (a pay-later bill: when it's marked paid), never before the bill
  let reviewText: { sent: boolean; status: string } | null = null;   // sent below, after the receipt

  // The receipt goes out once they've paid (if not paid yet, it's sent when you mark it paid)
  let receipt: { sent: boolean; reason?: string } = { sent: false, reason: fleet ? "fleet invoice" : paidNow ? "not requested" : "waiting for payment" };
  if (paidNow && input.sendReceipt !== false) receipt = await sendReceipt(job.data!.id, input.email ?? null);
  if (paidNow) reviewText = await reviewIfDue(ctx.booking.id);   // receipt first, then the thank-you
  let billText: { sent: boolean; status?: string } | null = null;
  let planBilled = 0;
  if (!paidNow && !fleet && input.planBill && ctx.planId) {
    // on their next monthly plan bill: nothing to pay today, the bill picks it up (and marks this paid when it's paid)
    const due = r2(total - prepaid + othersOwed);
    if (due > 0) {
      const sub = r2(due / (1 + Number(rules.hst_rate ?? 0.14)));
      const what = lines.filter((l) => Number(l.amount) > 0 && !/covered by your plan/i.test(l.label)).map((l) => l.label).join(", ") || "Parts";
      const r = await sbInsert("plan_extras", { plan_id: ctx.planId, booking_id: ctx.booking.id, job_id: job.data!.id, label: `${new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax", month: "short", day: "numeric" })}: ${what}`.slice(0, 300), subtotal: sub, hst: r2(due - sub), total: due });
      if (r.ok) { planBilled = due; await sbPatch("jobs", `id=eq.${job.data!.id}`, { payment_method: "plan_bill" }).catch(() => null); }
    }
  }
  if (!paidNow && !fleet && input.bill && !planBilled) {
    // due in 48 hours (setting bill_due_hours); after that the late fee, then monthly interest (bill-late.ts). They're told up front.
    const lr = lateRules(rules);
    const dueAt = new Date(Date.now() + lr.dueHours * 3600000).toISOString();
    await sbPatch("jobs", `id=eq.${job.data!.id}`, { bill_sent_at: now, bill_due_at: dueAt }).catch(() => null);   // the due date (and any late fee) sits on one car of the visit, so it's charged once
    for (const c of others) if (c.job) await sbPatch("jobs", `id=eq.${c.job.id}`, { bill_sent_at: now }).catch(() => null);
    receipt = await sendReceipt(job.data!.id, input.email ?? null, { textIfNoEmail: false });   // shows what's owed, the due date and a Pay button (every car of the visit)
    const due = r2(total - prepaid + othersOwed);
    const body = (await template("bill_sent")) || "Hi {first_name}, thanks for having us! Your total is {total}, due by {due_by}. E-transfer preferred, or pay by card here: {pay_link}\n{late_terms}\n- {signer}, Oil Change On The Spot";
    billText = ctx.customer ? await textCustomer("bill_sent", ctx.customer, { total: `$${due.toFixed(2)}`, pay_link: payLink(token), due_by: dueText(dueAt), late_terms: lateTerms(lr) }, ctx.booking.id)
      .then((x) => (x.status === "template_off" && body ? sendSms(ctx.customer!.phone || "", fill(body, { first_name: ctx.customer!.first_name?.trim() || "there", total: `$${due.toFixed(2)}`, pay_link: payLink(token), due_by: dueText(dueAt), late_terms: lateTerms(lr) }), { kind: "bill_sent", customerId: ctx.customer!.id, bookingId: ctx.booking.id }) : x)).catch(() => null) : null;
  }
  return { ok: true as const, jobId: job.data!.id, receiptNo, total: r2(total + others.reduce((t, c) => t + Number(c.job?.total ?? 0), 0)), cars: visit.length || 1, stock, prepaid, refund, receipt, reviewText, billText, planBilled, profit: r2(subtotal - costOil - costParts - (withOil ? rules.consumables ?? 1 : 0)) };
}

/** amount = the receipt total (with HST). A tip is added on top: it's income, but it never gets HST. */
export async function recordPayment(bookingId: string, amount: number, method: string, owner: string, tip = 0, opts: { noReview?: boolean } = {}) {
  const t = r2(Math.max(0, tip || 0));
  await sbInsert("payments", { booking_id: bookingId, amount: r2(amount + t), method, processor_ref: `recorded by ${owner}${t ? `, includes $${t.toFixed(2)} tip` : ""}` });
  await sbPatch("bookings", `id=eq.${enc(bookingId)}`, { paid_at: new Date().toISOString() });
  const [j] = await sbGet<{ subtotal: number | null; late_fee?: number | null; late_interest?: number | null }>(`jobs?select=*&booking_id=eq.${enc(bookingId)}&limit=1`);
  const late = Number(j?.late_fee ?? 0) + Number(j?.late_interest ?? 0);   // late charges are income too (no HST on them)
  await sbPatch("jobs", `booking_id=eq.${enc(bookingId)}`, { payment_method: method, tip: t, ...(j?.subtotal != null ? { revenue: r2(Number(j.subtotal) + t + late) } : {}) });
  // a pay-later bill just got paid: now the thank-you / review text goes out (once, and not for a visit with cars still unpaid)
  if (!opts.noReview && (j as { bill_sent_at?: string | null } | undefined)?.bill_sent_at) await reviewIfDue(bookingId).catch(() => null);
}

/** Fix a payment already marked: the tip and/or how they paid. Moves the difference onto the last payment for that car,
 *  so Money (sales, tips) and the receipt follow. Doesn't touch the job's price (that's Edit price). */
export async function editPayment(bookingId: string, change: { tip?: number | null; method?: string | null }, owner: string) {
  const [j] = await sbGet<{ id: string; subtotal: number | null; tip: number | null; late_fee?: number | null; late_interest?: number | null; payment_method: string | null }>(
    `jobs?select=*&booking_id=eq.${enc(bookingId)}&limit=1`);
  if (!j) return { ok: false as const, error: "No finished job for this booking" };
  const pays = await sbGet<{ id: string; amount: number; method: string | null; processor_ref: string | null; paid_at: string }>(
    `payments?select=id,amount,method,processor_ref,paid_at&booking_id=eq.${enc(bookingId)}&order=paid_at.desc`);
  if (!pays.length) return { ok: false as const, error: "It isn't marked paid yet. Use Mark paid instead." };
  const oldTip = r2(Number(j.tip ?? 0));
  const tip = change.tip == null ? oldTip : r2(Math.min(1000, Math.max(0, Number(change.tip) || 0)));
  const method = change.method || j.payment_method || pays[0].method;
  const diff = r2(tip - oldTip);
  const last = pays[0];
  if (r2(Number(last.amount) + diff) < 0) return { ok: false as const, error: "That would take the payment below $0" };
  const note = `${last.processor_ref ? `${last.processor_ref}; ` : ""}fixed by ${owner}: tip $${oldTip.toFixed(2)} → $${tip.toFixed(2)}${method !== last.method ? `, ${last.method ?? "?"} → ${method}` : ""}`.slice(0, 500);
  if (!(await sbPatch("payments", `id=eq.${last.id}`, { amount: r2(Number(last.amount) + diff), method, processor_ref: note }))) return { ok: false as const, error: "Couldn't save the payment" };
  const late = Number(j.late_fee ?? 0) + Number(j.late_interest ?? 0);
  await sbPatch("jobs", `id=eq.${j.id}`, { tip, payment_method: method, ...(j.subtotal != null ? { revenue: r2(Number(j.subtotal) + tip + late) } : {}) });
  return { ok: true as const, tip, method, oldTip };
}

/** Pay everything still owed on a visit (every car), the same way. The tip goes on the car you're looking at. */
export async function payVisit(bookingId: string, method: string, owner: string, tip = 0, opts: { noReview?: boolean } = {}) {
  const visit = await visitGroup(bookingId);
  const [b] = await sbGet<{ id: string }>(`bookings?select=id&id=eq.${enc(bookingId)}`);
  if (!b) return;
  const cars = visit.length ? visit.filter((c) => c.job) : [];
  if (!cars.length) return false;
  for (const c of cars) { const o = owedOn(c); const t = c.bookingId === bookingId ? tip : 0; if (o > 0 || t > 0) await recordPayment(c.bookingId, o, method, owner, t, opts); }
  return true;
}

/** The thank-you with the Google review link, for a first-time customer, once they've paid (every car of the visit). Sent once. */
export async function reviewIfDue(bookingId: string): Promise<{ sent: boolean; status: string } | null> {
  const [j] = await sbGet<{ review_requested: boolean | null; customer_id: string | null }>(`jobs?select=review_requested,customer_id&booking_id=eq.${enc(bookingId)}&limit=1`);
  if (!j?.review_requested || !j.customer_id) return null;
  const visit = await visitGroup(bookingId).catch(() => [] as VisitCar[]);
  if (visit.some((c) => !c.job || owedOn(c) > 0.009)) return null;   // a car still to finish or pay
  const [c] = await sbGet<{ id: string; first_name: string | null; phone: string | null; review_asked_at: string | null }>(`customers?select=id,first_name,phone,review_asked_at&id=eq.${j.customer_id}`);
  if (!c?.phone || c.review_asked_at) return null;
  await sbPatch("customers", `id=eq.${c.id}`, { review_asked_at: new Date().toISOString() });   // first, so two payments at once can't send it twice
  const body = await template("review_request");
  if (!body) return null;
  return sendSms(c.phone, fill(body, { first_name: c.first_name?.trim() || "there", review_link: await reviewLink() }), { kind: "review_request", customerId: c.id, bookingId });
}

const siteUrl = () => process.env.SITE_URL || (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://oilchangeonthespot.ca");

export async function receiptFor(where: string): Promise<{ data: ReceiptData; jobId: string; email: string | null; customerId: string | null; reviewAsked: boolean } | null> {
  const [j] = await sbGet<{ id: string; receipt_no: number; receipt_token: string; done_at: string; lines: { label: string; amount: number }[];
    subtotal: number; hst: number; total: number; payment_method: string | null; km: number | null; next_due_km: number | null; next_due_date: string | null;
    oil_grade: string | null; oil_litres: number | null; vehicle_text: string | null; customer_id: string | null; booking_id: string | null;
    filter_part: string | null; vehicle_id: string | null; review_requested: boolean | null; tip: number | null; service: string | null; inspection: Record<string, { status?: string }> | null; customer_note?: string | null }>(`jobs?select=*&${where}&limit=1`);
  if (!j) return null;
  const [c] = j.customer_id ? await sbGet<{ first_name: string | null; last_name: string | null; email: string | null; review_asked_at: string | null }>(
    `customers?select=first_name,last_name,email,review_asked_at&id=eq.${j.customer_id}`) : [];
  const [b] = j.booking_id ? await sbGet<{ address: string | null }>(`bookings?select=address&id=eq.${j.booking_id}`) : [];
  const [v] = j.vehicle_id ? await sbGet<{ vin: string | null; vehicle_specs: { oil_spec: string | null } | null }>(`vehicles?select=vin,vehicle_specs(oil_spec)&id=eq.${j.vehicle_id}`) : [];
  const [fp] = j.filter_part ? await sbGet<{ brand: string | null }>(`parts?select=brand&part_number=eq.${enc(j.filter_part)}&limit=1`) : [];
  const spec = v?.vehicle_specs?.oil_spec && !/^API\s*S/i.test(v.vehicle_specs.oil_spec) ? v.vehicle_specs.oil_spec : null;
  // several cars on one visit: one receipt for all of them (each car's lines under its name)
  const visit = j.booking_id ? (await visitGroup(j.booking_id).catch(() => [] as VisitCar[])).filter((c) => c.job) : [];
  const many = visit.length > 1;
  const sum = (f: (c: VisitCar) => number) => r2(visit.reduce((t, c) => t + f(c), 0));
  return {
    jobId: j.id, email: c?.email ?? null, customerId: j.customer_id, reviewAsked: !!c?.review_asked_at,
    data: {
      receiptNo: j.receipt_no, date: nice(new Date(j.done_at)), customer: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Customer",
      car: many ? visit.map((c) => c.job!.vehicle_text || c.car).join(" + ") : j.vehicle_text || "", address: b?.address ?? null,
      lines: many ? visit.flatMap((c) => (c.job!.lines ?? []).map((l) => ({ label: `${c.job!.vehicle_text || c.car}: ${l.label}`, amount: l.amount }))) : j.lines ?? [],
      subtotal: many ? sum((c) => Number(c.job!.subtotal)) : Number(j.subtotal), hst: many ? sum((c) => Number(c.job!.hst)) : Number(j.hst), total: many ? sum((c) => Number(c.job!.total)) : Number(j.total),
      tip: many ? sum((c) => Number(c.job!.tip ?? 0)) : Number(j.tip ?? 0),
      paidWith: j.payment_method, km: many ? null : j.km, nextDueKm: many ? null : j.next_due_km,   // several cars: in each car's own record below
      nextDueDate: many ? null : j.next_due_date ? nice(new Date(`${j.next_due_date}T12:00:00Z`)) : null,
      oil: many ? null
        : j.oil_grade ? `${j.oil_grade.replace(/^Euro /, "")} full synthetic${spec ? ` (meets ${spec})` : ""}${j.oil_litres ? `, ${Number(j.oil_litres)} L` : ""}` : null,
      filter: many ? null
        : j.filter_part ? `${fp?.brand || "NAPA ProFormer"} ${j.filter_part}` : null,
      vin: many ? null : v?.vin ?? null, customerNote: many ? null : j.customer_note ?? null,
      ...(await (async () => {
        const paid = j.booking_id ? (await sbGet<{ amount: number }>(`payments?select=amount&booking_id=eq.${j.booking_id}`).catch(() => [])).reduce((t, p) => t + Number(p.amount), 0) - Number(j.tip ?? 0) : 0;
        const x = j as unknown as { late_fee?: number | null; late_interest?: number | null; bill_due_at?: string | null };
        const due = many ? sum(owedOn) : owing({ total: Number(j.total), paid, lateFee: Number(x.late_fee ?? 0), lateInterest: Number(x.late_interest ?? 0) });
        const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value").catch(() => [])).map((y) => [y.key, Number(y.value)]));
        return { due: j.payment_method === "invoice" ? 0 : due, payUrl: due > 0 && j.payment_method !== "invoice" ? payLink(j.receipt_token) : null,
          late: [Number(x.late_fee) > 0 ? { label: "Late fee", amount: Number(x.late_fee) } : null, Number(x.late_interest) > 0 ? { label: "Interest on late payment", amount: Number(x.late_interest) } : null].filter(Boolean) as { label: string; amount: number }[],
          dueBy: due > 0 && x.bill_due_at && !(Number(x.late_fee) > 0) ? dueText(x.bill_due_at) : null,
          lateTerms: !(due > 0 && x.bill_due_at) ? null : Number(x.late_fee) > 0 ? `This bill is past due. ${lateRules(rules).monthlyPct > 0 ? `${lateRules(rules).monthlyPct}% interest is added each month until it's paid.` : ""}`.trim() : lateTerms(lateRules(rules)) };
      })()),
      checks: many ? null : !j.service || ["oil_change", "seasonal"].includes(j.service) ? checksFrom(j.inspection) : null,
      // several cars: each car gets its own service record, notes and checks, under its name
      cars: many ? await Promise.all(visit.map(async (c) => {
        const x = c.job!;
        const [vv] = x.vehicle_id ? await sbGet<{ vin: string | null }>(`vehicles?select=vin&id=eq.${x.vehicle_id}`).catch(() => []) : [];
        const [fb] = x.filter_part ? await sbGet<{ brand: string | null }>(`parts?select=brand&part_number=eq.${enc(x.filter_part)}&limit=1`).catch(() => []) : [];
        return { name: x.vehicle_text || c.car, vin: vv?.vin ?? null, km: x.km ?? null,
          oil: x.oil_grade ? `${x.oil_grade.replace(/^Euro /i, "").toUpperCase()} full synthetic${x.oil_litres ? `, ${Number(x.oil_litres)} L` : ""}` : null,
          filter: x.filter_part ? `${fb?.brand || "NAPA ProFormer"} ${x.filter_part}` : null,
          nextDueKm: x.next_due_km ?? null, nextDueDate: x.next_due_date ? nice(new Date(`${x.next_due_date}T12:00:00Z`)) : null,
          checks: checksFrom(x.inspection ?? null), note: x.customer_note ?? null };
      })) : undefined,
      receiptUrl: `${siteUrl()}/receipt/${j.receipt_token}`,
      logoUrl: `${siteUrl()}/email-logo.png`,
      reviewUrl: j.review_requested ? await reviewLink() : null,
      referUrl: j.customer_id ? await ensureRefCode(j.customer_id).then((c) => (c ? refLink(c) : null)).catch(() => null) : null,
      family: await familyOnReceipt(many ? visit.map((c) => ({ bookingId: c.bookingId, lines: c.job!.lines ?? [], name: c.job!.vehicle_text || c.car })) : j.booking_id ? [{ bookingId: j.booking_id, lines: j.lines ?? [], name: null }] : []),
    },
  };
}

/** A VIN on the job sheet: decode it (free NHTSA lookup) and, if the booking had the car wrong, fix the year, make,
 *  model and engine and save the VIN, which also looks up that car's oil and filter. The price isn't changed here. */
export async function fixCarFromVin(bookingId: string, raw: string) {
  const vin = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (vin.length !== 17) return { ok: false as const, error: "A VIN is 17 characters" };
  const ctx = await jobContext(bookingId);
  if (!ctx?.vehicle || !ctx.customer) return { ok: false as const, error: "No car on this booking to fix" };
  const { decodeVin } = await import("@/lib/os/vin-photo");
  const d = await decodeVin(vin).catch(() => null);
  if (!d?.year || !d.make || !d.model) return { ok: true as const, changed: false, read: false, note: "Couldn't read that VIN online (or it isn't a North American VIN). Saved it as typed." };
  const v = ctx.vehicle;
  const same = (a: unknown, b: unknown) => String(a ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "") === String(b ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  const engine = d.engineL ? `${d.engineL}L` : v.engine;
  const engineDiff = !!d.engineL && !(v.engine ?? "").startsWith(d.engineL);
  const changed = !same(v.year, d.year) || !same(v.make, d.make) || !same(v.model, d.model) || engineDiff;
  const was = [v.year, v.make, v.model, v.engine].filter(Boolean).join(" ");
  const now = [d.year, d.make, d.model, engine].filter(Boolean).join(" ");
  const { updateCar } = await import("@/lib/os/customers");
  const r = await updateCar(ctx.customer.id, v.id, changed ? { year: d.year, make: d.make, model: d.model, engine: engineDiff ? engine : v.engine, vin } : { vin });
  if (!r.ok) return r;
  // a different size of vehicle may mean a different price
  let priceNote = "";
  if (changed) {
    const { detectClassFromModel } = await import("@/data/vehicleClass");
    const before = detectClassFromModel(v.model ?? "", v.make ?? ""), after = detectClassFromModel(d.model, d.make);
    const word = (c: string | null) => ({ Sedan: "a car", "SUV/Crossover": "an SUV", "Large SUV": "a large SUV", Truck: "a truck", "Sports Car": "a sports car" } as Record<string, string>)[c ?? ""] ?? "a different size";
    if (before !== after) priceNote = ` It's ${word(after)}, not ${word(before)}: check the price with Edit price.`;
  }
  return { ok: true as const, changed, read: true, was, now, note: changed ? `The VIN says ${now}, the booking had ${was}. Fixed the car and its oil and filter.${priceNote}` : `VIN matches the ${now}. Saved.` };
}

/** Work a finished job's costs out again from today's prices (after fixing a price a receipt got wrong). */
export async function recostJob(bookingId: string) {
  const [j] = await sbGet<{ id: string; oil_grade: string | null; oil_litres: number | null; filter_part: string | null; lines: { label: string; amount: number }[] | null; cost_oil: number | null; cost_parts: number | null }>(
    `jobs?select=id,oil_grade,oil_litres,filter_part,lines,cost_oil,cost_parts&booking_id=eq.${enc(bookingId)}&limit=1`);
  if (!j) return { ok: false as const, error: "This job isn't finished" };
  const [b] = await sbGet<{ cars: number | null; services: { addons?: string[] } | null; vehicles: { vehicle_specs: { cabin_filter_part?: string | null; air_filter_part?: string | null } | null } | null }>(
    `bookings?select=cars,services,vehicles(vehicle_specs(cabin_filter_part,air_filter_part))&id=eq.${enc(bookingId)}`).catch(() => []);
  const cars = b?.cars || 1;
  const rulesRows = await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value").catch(() => []);
  const rules = Object.fromEntries(rulesRows.map((x) => [x.key, Number(x.value)]));
  const quotes = await sbGet<{ our_cost: number | null; parts: { part_number: string } | null }>("part_quotes?select=our_cost,parts!inner(part_number)&our_cost=not.is.null&order=checked_at.desc&limit=3000").catch(() => []);
  const costOf = (pn: string | null | undefined) => { const q = pn ? quotes.find((x) => x.parts && normPart(x.parts.part_number) === normPart(pn)) : undefined; return q ? Number(q.our_cost) : null; };
  let costOil = Number(j.cost_oil ?? 0);
  if (j.oil_grade && j.oil_litres) {
    const [op] = await sbGet<{ cost_per_l: number }>(`oil_prices?select=cost_per_l&grade=eq.${enc(j.oil_grade)}`).catch(() => []);
    if (op) costOil = r2(Number(j.oil_litres) * Number(op.cost_per_l));
  }
  let costParts = j.filter_part ? r2((costOf(j.filter_part) ?? rules.filter_estimate ?? 6.5) * cars) : 0;
  const spec = b?.vehicles?.vehicle_specs;
  for (const { kind, times } of chargedAddons(j.lines ?? [], b?.services?.addons, cars)) {
    if (kind === "washer_fluid" || kind === "coolant") {
      const perL = costOf(kind === "coolant" ? "COOLANT" : "WASHER-FLUID");
      costParts = r2(costParts + (perL != null ? perL * topupLitres(kind, rules) * times : (rules[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times));
      continue;
    }
    const pn = kind === "cabin_filter" ? spec?.cabin_filter_part : kind === "engine_filter" ? spec?.air_filter_part : null;
    costParts = r2(costParts + (costOf(pn) ?? rules[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times);
  }
  await sbPatch("jobs", `id=eq.${j.id}`, { cost_oil: costOil, cost_parts: costParts });
  return { ok: true as const, before: r2(Number(j.cost_oil ?? 0) + Number(j.cost_parts ?? 0)), after: r2(costOil + costParts) };
}

/** Litres a top-up takes: HQ settings topup_washer_l / topup_coolant_l, or 2 L of washer fluid and 1 L of coolant. */
const topupLitres = (kind: "washer_fluid" | "coolant", rules: Record<string, number>) =>
  Number(rules[kind === "coolant" ? "topup_coolant_l" : "topup_washer_l"] ?? TOPUP_L[kind]);

/** Take the add-on parts a finished job used off Stock (never below zero), and say what came off or why not. */
async function takeAddonParts(lines: { label: string; amount: number }[], booked: string[] | undefined, cars: number,
  spec: { cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null } | null | undefined,
  jobId: string, say: string[], rules: Record<string, number> = {}) {
  const charged = chargedAddons(lines, booked, cars);
  if (!charged.length) return;
  const { loadLinks, sameParts } = await import("@/lib/os/part-alias");
  const links = await loadLinks();
  const all = await sbGet<{ id: string; part_number: string; description: string | null; category: string | null; on_hand: number }>(
    "parts?select=id,part_number,description,category,on_hand&on_hand=gt.0&limit=2000").catch(() => []);
  const take = async (find: (p: (typeof all)[number]) => boolean, qty: number, name: string) => {
    let left = qty;
    for (const p of all.filter(find).sort((a, b) => Number(b.on_hand) - Number(a.on_hand))) {
      if (left <= 0) break;
      const used = Math.min(Number(p.on_hand), left);
      if (used <= 0) continue;
      p.on_hand = r2(Number(p.on_hand) - used); left -= used;
      await sbPatch("parts", `id=eq.${p.id}`, { on_hand: p.on_hand });
      await sbInsert("stock_moves", { part_id: p.id, qty: -used, reason: "job", job_id: jobId });
      say.push(`${name} ${p.part_number}: ${p.on_hand} left`);
    }
    if (left > 0) say.push(`${name}: ${left === qty ? "none" : "not enough"} in Stock, so ${left} didn't come off`);
  };
  for (const { kind, times } of charged) {
    if (kind === "cabin_filter" || kind === "engine_filter") {
      const pn = kind === "cabin_filter" ? spec?.cabin_filter_part : spec?.air_filter_part;
      const name = kind === "cabin_filter" ? "Cabin filter" : "Engine air filter";
      if (!pn) { say.push(`${name}: no part # on this car, so nothing came off Stock (add it in Edit details)`); continue; }
      // the cars' own number first, then a filter linked as the same part
      let left = times;
      for (const g of sameParts(pn, links).map(normPart)) {
        if (left <= 0) break;
        const n = all.filter((p) => normPart(p.part_number) === g).reduce((t, p) => t + Number(p.on_hand), 0);
        if (n <= 0) continue;
        const q = Math.min(n, left);
        await take((p) => normPart(p.part_number) === g, q, name);
        left -= q;
      }
      if (left > 0) say.push(`${name} ${pn}: ${left === times ? "none" : "not enough"} in Stock, so ${left} didn't come off`);
    } else if (kind === "wipers") {
      const sizes = [spec?.wiper_driver, spec?.wiper_passenger].filter(Boolean) as string[];
      if (!sizes.length) { say.push("Wipers: no sizes on this car, so nothing came off Stock (add them in Edit details)"); continue; }
      for (const size of sizes) {
        const re = new RegExp(`(^|\\D)${size}(\\D|$)`);
        await take((p) => p.category === "wiper" && re.test(`${p.part_number} ${p.description ?? ""}`), Math.max(1, Math.round(times)), `Wiper ${size}"`);
      }
    } else if (kind === "washer_fluid" || kind === "coolant") {
      // kept in litres: a top-up takes the usual amount (HQ setting), from the WASHER-FLUID / COOLANT stock
      const litres = r2(topupLitres(kind, rules) * times), pn = kind === "coolant" ? "COOLANT" : "WASHER-FLUID";
      const name = kind === "coolant" ? "Coolant" : "Washer fluid";
      const [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${pn}&order=on_hand.desc&limit=1`).catch(() => []);
      if (!p || Number(p.on_hand) <= 0) { say.push(`${name}: none in Stock, so nothing came off`); continue; }
      const used = Math.min(Number(p.on_hand), litres), left = r2(Number(p.on_hand) - used);
      await sbPatch("parts", `id=eq.${p.id}`, { on_hand: left });
      await sbInsert("stock_moves", { part_id: p.id, qty: -used, reason: "job", job_id: jobId });
      say.push(`${name}: -${used} L, ${left} L left`);
    } else if (kind === "battery") {
      await take((p) => p.category === "battery", 1, "Battery");
    }
  }
}

/** Family price receipt: the regular price lines (what it would have been), so the receipt can show the discount.
 *  null when no car on the visit is on the family price. */
async function familyOnReceipt(cars: { bookingId: string; lines: { label: string; amount: number }[]; name: string | null }[]) {
  if (!cars.length) return null;
  const rows = await sbGet<{ id: string; quote_breakdown: { family?: { label: string; amount: number }[] } | null }>(
    `bookings?select=id,quote_breakdown&id=in.(${cars.map((c) => c.bookingId).join(",")})`).catch(() => []);
  if (!rows.some((b) => b.quote_breakdown?.family?.length)) return null;
  const lines = cars.flatMap((c) => {
    const regular = rows.find((b) => b.id === c.bookingId)?.quote_breakdown?.family ?? c.lines;
    return regular.map((l) => ({ label: c.name ? `${c.name}: ${l.label}` : l.label, amount: Number(l.amount) }));
  });
  return { lines, subtotal: r2(lines.reduce((t, l) => t + l.amount, 0)) };
}

/** Email the receipt. (The review request is its own message, sent separately.) */
export async function sendReceipt(jobId: string, emailOverride: string | null, opts: { textIfNoEmail?: boolean } = {}): Promise<{ sent: boolean; reason?: string; by?: "email" | "text" }> {
  const r = await receiptFor(`id=eq.${enc(jobId)}`);
  if (!r) return { sent: false, reason: "job not found" };
  const to = (emailOverride || r.email || "").trim();
  // no email (or email isn't working): text them the receipt link instead
  const byText = async (why: string) => {
    if (opts.textIfNoEmail === false || !r.customerId || !r.data.receiptUrl) return { sent: false, reason: why };
    const [c] = await sbGet<{ id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null }>(`customers?select=id,first_name,phone,sms_opt_out&id=eq.${r.customerId}`);
    if (!c?.phone || c.sms_opt_out) return { sent: false, reason: why };
    const body = (await template("receipt_text")) || "Hi {first_name}, here's your receipt from Oil Change On The Spot (#{receipt_no}): {receipt_link}\n- {signer}, Oil Change On The Spot";
    const sms = await sendSms(c.phone, fill(body, { first_name: c.first_name?.trim() || "there", receipt_no: String(r.data.receiptNo), receipt_link: r.data.receiptUrl }), { kind: "receipt_text", customerId: c.id }).catch(() => null);
    if (!sms?.sent) return { sent: false, reason: why };
    await sbPatch("jobs", `id=eq.${r.jobId}`, { receipt_sent_at: new Date().toISOString() });
    return { sent: true, by: "text" as const };
  };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return byText("no email on file");
  if (!process.env.RESEND_API_KEY) return byText("email service not set up");
  const data = r.data;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: emailFrom(),
      to, replyTo: process.env.NOTIFY_TO || process.env.EMAIL_TO || undefined,
      subject: data.due && data.due > 0 ? `Your bill from Oil Change On The Spot (#${data.receiptNo}): $${data.due.toFixed(2)} to pay` : `Your receipt from Oil Change On The Spot (#${data.receiptNo})`,
      html: receiptHtml(data), text: receiptText(data),
    });
  } catch (e) { return byText(String(e).slice(0, 120)); }
  await sbPatch("jobs", `id=eq.${r.jobId}`, { receipt_sent_at: new Date().toISOString() });
  return { sent: true, by: "email" };
}

/** Take the gloves (counted in boxes) and shop towels a visit uses off the shelf. Never below zero; nothing if they aren't in stock yet. */
async function useSupplies(cars: number, rules: Record<string, number | undefined>, jobId: string) {
  const perBox = rules.gloves_per_box || 100;
  const use: [string, number][] = [["GLOVES", ((rules.gloves_per_car ?? 2) * cars) / perBox], ["SHOP-TOWELS", (rules.towels_per_car ?? 2) * cars]];
  for (const [pn, n] of use) {
    if (!(n > 0)) continue;
    const [p] = await sbGet<{ id: string; on_hand: number }>(`parts?select=id,on_hand&part_number=eq.${pn}&order=on_hand.desc&limit=1`);
    if (!p || Number(p.on_hand) <= 0) continue;
    const used = Math.min(Number(p.on_hand), Math.round(n * 100) / 100);
    await sbPatch("parts", `id=eq.${p.id}`, { on_hand: Math.round((Number(p.on_hand) - used) * 100) / 100 });
    await sbInsert("stock_moves", { part_id: p.id, qty: -used, reason: "job", job_id: jobId });
  }
}

/** The note for the customer on a finished job's receipt (needs migration 0046). */
export async function setCustomerNote(jobId: string, note: string) {
  await sbPatch("jobs", `id=eq.${enc(jobId)}`, { customer_note: note.trim().slice(0, 600) || null }).catch(() => null);
}

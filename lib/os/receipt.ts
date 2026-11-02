// Customer receipt: one HTML used for the email and the web page.
export const BUSINESS = {
  name: "Oil Change On The Spot Limited",
  short: "Oil Change On The Spot",
  hst: "780152179RC0001",
  // same setting as lib/os/business.ts (kept import-free so the receipt tests run on their own)
  phone: ((d) => d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : "782-640-8341")((process.env.NEXT_PUBLIC_BUSINESS_PHONE || "782-640-8341").replace(/\D/g, "").slice(-10)),
  email: "oilchangeonthespot@gmail.com",
  town: "Dartmouth, NS",
  site: "oilchangeonthespot.ca",
};

export type ReceiptData = {
  receiptNo: number; date: string; customer: string; car: string; address?: string | null;
  lines: { label: string; amount: number }[]; subtotal: number; hst: number; total: number; tip?: number;
  paidWith?: string | null; km?: number | null; nextDueKm?: number | null; nextDueDate?: string | null;
  oil?: string | null; filter?: string | null; vin?: string | null;
  reviewUrl?: string | null; receiptUrl?: string | null; logoUrl?: string | null;
  referUrl?: string | null;   // their own referral link: a friend books with it, they get $5 off
  checks?: { now: string[]; soon: string[]; ok: string[] } | null;   // the OK / Soon / Now taps from the job
  customerNote?: string | null;   // what we noticed, written on the job ("front tires are getting low")
  due?: number;              // still to pay (they're paying later)
  late?: { label: string; amount: number }[];   // late fee / interest (no HST)
  dueBy?: string | null; lateTerms?: string | null;
  payUrl?: string | null;    // their pay page: card online, or e-transfer details
  cars?: CarRecord[];        // several cars on one visit: a service record, the checks and the notes for each car
};
export type CarRecord = { name?: string | null; vin?: string | null; km?: number | null; oil?: string | null; filter?: string | null;
  nextDueKm?: number | null; nextDueDate?: string | null; checks?: { now: string[]; soon: string[]; ok: string[] } | null; note?: string | null };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
export const METHOD_NAMES: Record<string, string> = {
  card_terminal: "Card (debit/credit)", cash: "Cash", etransfer: "E-transfer", card_online: "Paid online", invoice: "Invoice",
};

export function receiptHtml(r: ReceiptData): string {
  const row = (a: string, b: string, bold = false) =>
    `<tr><td style="padding:6px 0;${bold ? "font-weight:700;font-size:17px;" : ""}">${a}</td><td style="padding:6px 0;text-align:right;${bold ? "font-weight:700;font-size:17px;" : ""}">${b}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Receipt #${r.receiptNo}</title></head><body style="margin:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;color:#0d1b3e">
<div style="max-width:560px;margin:0 auto;padding:16px">
 <div style="background:#fff;border-radius:14px 14px 0 0;padding:18px 20px;border-bottom:4px solid #f2b01e">
  <table style="width:100%;border-collapse:collapse"><tr>
   <td style="vertical-align:middle">${r.logoUrl ? `<img src="${esc(r.logoUrl)}" alt="${esc(BUSINESS.short)}" width="120" style="display:block;width:120px;height:auto;border:0">` : `<div style="font-size:22px;font-weight:800">${esc(BUSINESS.short)}</div>`}</td>
   <td style="vertical-align:middle;text-align:right">
    <div style="font-size:13px;letter-spacing:2px;color:#c98a00;font-weight:700">RECEIPT</div>
    <div style="font-size:22px;font-weight:800">#${r.receiptNo}</div>
    <div style="font-size:14px;color:#4a5878">${esc(r.date)}</div>
   </td></tr></table>
 </div>
 <div style="background:#fff;border-radius:0 0 14px 14px;padding:4px 20px 20px">
  <p style="margin:0 0 4px;font-size:16px">Thanks, ${esc(r.customer.split(" ")[0] || "there")}. Here's your receipt.</p>
  <p style="margin:0 0 16px;font-size:14px;color:#4a5878">${esc(r.car)}${r.address ? ` · ${esc(r.address)}` : ""}</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px">
   ${r.lines.map((l) => row(esc(l.label), money(l.amount))).join("")}
   <tr><td colspan="2" style="border-top:1px solid #c8d0e0;padding-top:4px"></td></tr>
   ${row("Subtotal", money(r.subtotal))}
   ${row("HST 14%", money(r.hst))}
   ${row("Total", money(r.total), true)}
   ${r.tip ? row("Tip, thank you!", money(r.tip)) : ""}
   ${r.paidWith ? row(`Paid: ${esc(METHOD_NAMES[r.paidWith] || r.paidWith)}`, money(r.total + (r.tip || 0))) : ""}
   ${(r.late ?? []).map((l) => row(esc(l.label), money(l.amount))).join("")}
   ${r.due && r.due > 0 ? row(r.dueBy ? `Amount due by ${esc(r.dueBy)}` : "Amount due", money(r.due), true) : ""}
  </table>
  ${r.due && r.due > 0 && r.payUrl ? `<div style="text-align:center;margin-top:16px">
   <a href="${esc(r.payUrl)}" style="display:inline-block;background:#f2b01e;color:#0d1b3e;font-weight:800;font-size:17px;text-decoration:none;padding:14px 28px;border-radius:10px">Pay ${money(r.due)}</a>
   <div style="font-size:13px;color:#4a5878;margin-top:8px">Card online, or Interac e-Transfer to ${esc(BUSINESS.email)} (put #${r.receiptNo} in the message).</div>
   ${r.lateTerms ? `<div style="font-size:13px;color:#8a5a00;margin-top:6px">${esc(r.lateTerms)}</div>` : ""}
  </div>` : ""}
  ${(r.cars?.length ? r.cars : [{ vin: r.vin, km: r.km, oil: r.oil, filter: r.filter, nextDueKm: r.nextDueKm, nextDueDate: r.nextDueDate, checks: r.checks, note: r.customerNote }]).map(recordHtml).join("")}
  ${r.reviewUrl ? `<div style="border:2px solid #f2b01e;border-radius:10px;padding:14px;margin-top:16px;font-size:15px;line-height:1.5">
   Happy with the service? A quick Google review helps other people in HRM find us and supports our small business.<br>
   <a href="${esc(r.reviewUrl)}" style="display:inline-block;margin-top:10px;background:#f2b01e;color:#0d1b3e;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px">Leave a review</a>
  </div>` : ""}
  <div style="border-radius:10px;padding:14px;margin-top:16px;font-size:14px;line-height:1.5;background:#f4f6fa;color:#0d1b3e">
   <strong>Refer a friend, get $5 off.</strong> ${r.referUrl ? `Send them your link. When they book with it and we've done their car, $5 comes off your next oil change on its own:<br>
   <a href="${esc(r.referUrl)}" style="color:#0d1b3e;font-weight:700">${esc(r.referUrl.replace(/^https?:\/\//, ""))}</a>` : "Tell them to mention your name when they book, and $5 comes off your next oil change."}
  </div>
  <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#4a5878">${esc(BUSINESS.name)} · ${esc(BUSINESS.town)} · ${esc(BUSINESS.phone)} · ${esc(BUSINESS.email)}<br>HST # ${BUSINESS.hst}${r.receiptUrl ? ` · <a href="${esc(r.receiptUrl)}" style="color:#4a5878">View online</a>` : ""}</p>
 </div>
</div></body></html>`;
}


/** One car's service record, the notes for it and what we checked on it (a heading with the car when there are several). */
function recordHtml(c: CarRecord): string {
  return `${c.name ? `<div style="font-weight:800;font-size:17px;margin-top:22px;padding-top:12px;border-top:2px solid #0d1b3e">${esc(c.name)}</div>` : ""}
  ${c.oil || c.km || c.nextDueKm || c.nextDueDate || c.vin || c.filter ? `<div style="background:#eef1f6;border-radius:10px;padding:14px;margin-top:16px;font-size:14px;line-height:1.6">
   <div style="font-weight:700;margin-bottom:4px">Service record</div>
   ${c.vin ? `<div><strong>VIN:</strong> ${esc(c.vin)}</div>` : ""}
   ${c.km ? `<div><strong>Odometer:</strong> ${c.km.toLocaleString("en-CA")} km</div>` : ""}
   ${c.oil ? `<div><strong>Oil:</strong> ${esc(c.oil)}</div>` : ""}
   ${c.filter ? `<div><strong>Oil filter:</strong> ${esc(c.filter)}</div>` : ""}
   ${c.nextDueKm || c.nextDueDate ? `<div><strong>Next oil change:</strong> ${c.nextDueKm ? `${c.nextDueKm.toLocaleString("en-CA")} km` : ""}${c.nextDueKm && c.nextDueDate ? " or " : ""}${c.nextDueDate ? esc(c.nextDueDate) : ""}, whichever comes first</div>` : ""}
  </div>` : ""}
  ${c.note ? `<div style="border-radius:10px;padding:14px;margin-top:16px;font-size:14px;line-height:1.6;background:#fff6dd;border:1px solid #f2b01e">
   <div style="font-weight:700;margin-bottom:4px">Notes from your technician</div>
   <div style="white-space:pre-wrap">${esc(c.note)}</div>
  </div>` : ""}
  ${c.checks && (c.checks.now.length || c.checks.soon.length || c.checks.ok.length) ? `<div style="border-radius:10px;padding:14px;margin-top:16px;font-size:14px;line-height:1.6;border:1px solid #c8d0e0">
   <div style="font-weight:700;margin-bottom:4px">What we checked</div>
   ${c.checks.now.length ? `<div style="color:#9b1c1c"><strong>Needs doing now:</strong> ${esc(c.checks.now.join(", "))}</div>` : ""}
   ${c.checks.soon.length ? `<div style="color:#8a5a00"><strong>Coming up soon:</strong> ${esc(c.checks.soon.join(", "))}</div>` : ""}
   ${c.checks.ok.length ? `<div style="color:#1d6b3a"><strong>Good:</strong> ${esc(c.checks.ok.join(", "))}</div>` : ""}
   ${[...c.checks.now, ...c.checks.soon].some((x) => !/\btires?\b/i.test(x)) ? `<div style="margin-top:6px;color:#4a5878">We can take care of ${[...c.checks.now, ...c.checks.soon].some((x) => /\btires?\b/i.test(x)) ? "everything except the tires" : "these"} on your next visit. Reply or text ${esc(BUSINESS.phone)} and we'll add them.</div>` : ""}
   ${[...c.checks.now, ...c.checks.soon].some((x) => /\btires?\b/i.test(x)) ? `<div style="margin-top:6px;color:#4a5878">For the tires, we recommend a tire shop.</div>` : ""}
  </div>` : ""}`;
}

export function receiptText(r: ReceiptData): string {
  return [
    `${BUSINESS.short} receipt #${r.receiptNo}, ${r.date}`, r.car, "",
    ...r.lines.map((l) => `${l.label}: ${money(l.amount)}`), `HST 14%: ${money(r.hst)}`, `Total: ${money(r.total)}`,
    r.tip ? `Tip, thank you!: ${money(r.tip)}` : "",
    r.paidWith ? `Paid: ${METHOD_NAMES[r.paidWith] || r.paidWith}, ${money(r.total + (r.tip || 0))}` : "",
    ...(r.cars?.length ? r.cars : [{ vin: r.vin, km: r.km, oil: r.oil, filter: r.filter, nextDueKm: r.nextDueKm, nextDueDate: r.nextDueDate, checks: r.checks, note: r.customerNote } as CarRecord]).flatMap((c) => [
      c.name ? `\n${c.name}` : "",
      c.vin ? `VIN: ${c.vin}` : "", c.km ? `Odometer: ${c.km} km` : "", c.oil ? `Oil: ${c.oil}` : "", c.filter ? `Oil filter: ${c.filter}` : "",
      c.nextDueKm || c.nextDueDate ? `Next oil change: ${[c.nextDueKm ? `${c.nextDueKm} km` : "", c.nextDueDate ?? ""].filter(Boolean).join(" or ")}` : "",
      c.note ? `Notes from your technician: ${c.note}` : "",
      c.checks?.now.length ? `Needs doing now: ${c.checks.now.join(", ")}` : "", c.checks?.soon.length ? `Coming up soon: ${c.checks.soon.join(", ")}` : ""]),
    ...(r.late ?? []).map((l) => `${l.label}: ${money(l.amount)}`),
    r.due && r.due > 0 ? `Amount due${r.dueBy ? ` by ${r.dueBy}` : ""}: ${money(r.due)}${r.payUrl ? `. Pay here: ${r.payUrl}` : ""} (or e-transfer to ${BUSINESS.email} with #${r.receiptNo} in the message)${r.lateTerms ? ` ${r.lateTerms}` : ""}` : "",
    r.referUrl ? `Refer a friend, get $5 off your next oil change: ${r.referUrl}` : "",
    "", `${BUSINESS.name}, HST # ${BUSINESS.hst}, ${BUSINESS.phone}`,
  ].filter((x) => x !== "").join("\n");
}

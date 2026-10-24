// Customer receipt: one HTML used for the email and the web page.
export const BUSINESS = {
  name: "Oil Change On The Spot Limited",
  short: "Oil Change On The Spot",
  hst: "780152179RC0001",
  phone: "782-640-8341",
  email: "oilchangeonthespot@gmail.com",
  town: "Dartmouth, NS",
  site: "oilchangeonthespot.ca",
};

export type ReceiptData = {
  receiptNo: number; date: string; customer: string; car: string; address?: string | null;
  lines: { label: string; amount: number }[]; subtotal: number; hst: number; total: number;
  paidWith?: string | null; km?: number | null; nextDueKm?: number | null; nextDueDate?: string | null;
  oil?: string | null; filter?: string | null; vin?: string | null;
  reviewUrl?: string | null; receiptUrl?: string | null; logoUrl?: string | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
export const METHOD_NAMES: Record<string, string> = {
  card_terminal: "Card (debit/credit)", cash: "Cash", etransfer: "E-transfer", card_online: "Paid online", invoice: "Invoice",
};

export function receiptHtml(r: ReceiptData): string {
  const row = (a: string, b: string, bold = false) =>
    `<tr><td style="padding:6px 0;${bold ? "font-weight:700;font-size:17px;" : ""}">${a}</td><td style="padding:6px 0;text-align:right;${bold ? "font-weight:700;font-size:17px;" : ""}">${b}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;color:#0d1b3e">
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
   ${r.paidWith ? row(`Paid: ${esc(METHOD_NAMES[r.paidWith] || r.paidWith)}`, money(r.total)) : ""}
  </table>
  ${r.oil || r.km || r.nextDueKm || r.vin || r.filter ? `<div style="background:#eef1f6;border-radius:10px;padding:14px;margin-top:16px;font-size:14px;line-height:1.6">
   <div style="font-weight:700;margin-bottom:4px">Service record</div>
   ${r.vin ? `<div><strong>VIN:</strong> ${esc(r.vin)}</div>` : ""}
   ${r.km ? `<div><strong>Odometer:</strong> ${r.km.toLocaleString("en-CA")} km</div>` : ""}
   ${r.oil ? `<div><strong>Oil:</strong> ${esc(r.oil)}</div>` : ""}
   ${r.filter ? `<div><strong>Oil filter:</strong> ${esc(r.filter)}</div>` : ""}
   ${r.nextDueKm || r.nextDueDate ? `<div><strong>Next oil change:</strong> ${r.nextDueKm ? `${r.nextDueKm.toLocaleString("en-CA")} km` : ""}${r.nextDueKm && r.nextDueDate ? " or " : ""}${r.nextDueDate ? esc(r.nextDueDate) : ""}, whichever comes first</div>` : ""}
  </div>` : ""}
  ${r.reviewUrl ? `<div style="border:2px solid #f2b01e;border-radius:10px;padding:14px;margin-top:16px;font-size:15px;line-height:1.5">
   Happy with the service? A quick Google review helps our small business a lot.<br>
   <a href="${esc(r.reviewUrl)}" style="display:inline-block;margin-top:10px;background:#f2b01e;color:#0d1b3e;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px">Leave a review</a>
  </div>` : ""}
  <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#4a5878">${esc(BUSINESS.name)} · ${esc(BUSINESS.town)} · ${esc(BUSINESS.phone)} · ${esc(BUSINESS.email)}<br>HST # ${BUSINESS.hst}${r.receiptUrl ? ` · <a href="${esc(r.receiptUrl)}" style="color:#4a5878">View online</a>` : ""}</p>
 </div>
</div></body></html>`;
}

export function receiptText(r: ReceiptData): string {
  return [
    `${BUSINESS.short} receipt #${r.receiptNo}, ${r.date}`, r.car, "",
    ...r.lines.map((l) => `${l.label}: ${money(l.amount)}`), `HST 14%: ${money(r.hst)}`, `Total: ${money(r.total)}`,
    r.paidWith ? `Paid: ${METHOD_NAMES[r.paidWith] || r.paidWith}` : "",
    r.vin ? `VIN: ${r.vin}` : "", r.km ? `Odometer: ${r.km} km` : "", r.oil ? `Oil: ${r.oil}` : "", r.filter ? `Oil filter: ${r.filter}` : "",
    r.nextDueKm ? `Next oil change: ${r.nextDueKm} km${r.nextDueDate ? ` or ${r.nextDueDate}` : ""}` : "",
    "", `${BUSINESS.name}, HST # ${BUSINESS.hst}, ${BUSINESS.phone}`,
  ].filter((x) => x !== "").join("\n");
}

// A fleet invoice: private link, prints cleanly (Print or Save as PDF).
import { invoiceByToken } from "@/lib/os/fleet";
import { PHONE, EMAIL } from "@/components/site/brand";
import PrintButton from "./PrintButton";
import { BUSINESS } from "@/lib/os/receipt";
import { payReady } from "@/lib/os/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const nice = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function InvoicePage({ params }: { params: { token: string } }) {
  const r = await invoiceByToken(params.token).catch(() => null);
  if (!r || r.invoice.status === "void") return <div className="max-w-2xl mx-auto px-4 py-16 text-[#0d1b3e]"><h1 className="text-2xl font-bold">This invoice isn&apos;t available.</h1><p className="mt-2">Call or text {PHONE}.</p></div>;
  const { invoice: i, account: a } = r;
  const gst = BUSINESS.hst;
  return (
    <div className="bg-[#eef1f6] print:bg-white min-h-screen py-6 print:py-0">
      <div className="max-w-3xl mx-auto bg-white p-6 sm:p-10 text-[#0d1b3e] text-[14px] shadow print:shadow-none">
        <div className="flex justify-between gap-6 flex-wrap">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-tight.webp" alt="Oil Change On The Spot" className="h-16 w-auto" />
            <p className="mt-2 font-bold">Oil Change On The Spot Limited</p>
            <p>Dartmouth, Nova Scotia</p><p>{PHONE} · {EMAIL}</p>{gst && <p>HST # {gst}</p>}
          </div>
          <div className="text-right">
            <p className="text-[28px] font-extrabold leading-none" style={{ fontFamily: "var(--font-condensed)" }}>INVOICE</p>
            <p className="mt-2"><strong>#{i.invoice_no}</strong></p>
            <p>Issued {nice(i.issued_at)}</p>
            {i.due_at && <p>Due {nice(i.due_at)}</p>}
            {i.status === "paid" && <p className="mt-1 inline-block rounded px-2 py-0.5 font-bold" style={{ background: "#dff3e6", color: "#1d6b3a" }}>PAID {i.paid_at ? nice(i.paid_at) : ""}</p>}
          </div>
        </div>
        <div className="mt-6">
          <p className="text-xs font-bold tracking-wider text-[#4a5878]">BILL TO</p>
          <p className="font-bold">{a?.business_name}</p>
          {a?.contact_name && <p>{a.contact_name}</p>}
          {a?.address && <p>{a.address}</p>}
          {a?.via && <p>Via {a.via}</p>}
        </div>
        <table className="w-full mt-6 border-collapse">
          <thead><tr className="text-left border-b-2 border-[#0d1b3e]"><th className="py-2 pr-2">Date</th><th className="py-2 pr-2">Vehicle</th><th className="py-2 pr-2">Work done</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {i.lines.map((l, n) => (
              <tr key={n} className="border-b border-[#dde3ee] align-top">
                <td className="py-2 pr-2 whitespace-nowrap">{nice(l.date)}</td>
                <td className="py-2 pr-2">{l.unit ? <strong>Unit {l.unit}<br /></strong> : null}{l.vehicle}{l.plate ? <><br />{l.plate}</> : null}{l.vin ? <><br /><span className="font-mono text-[12px]">{l.vin}</span></> : null}{l.km ? <><br />{l.km.toLocaleString()} km</> : null}</td>
                <td className="py-2 pr-2">{l.items.map((x, k) => <div key={k}>{x.label}{l.items.length > 1 ? ` (${money(x.amount)})` : ""}</div>)}{l.receiptNo ? <div className="text-[12px] text-[#4a5878]">Job #{l.receiptNo}</div> : null}
                  {l.checks && (l.checks.now.length > 0 || l.checks.soon.length > 0) && <div className="text-[12px] mt-1 leading-snug">
                    {l.checks.now.length > 0 && <div className="font-semibold text-[#9b1c1c]">Needs doing now: {l.checks.now.join(", ")}</div>}
                    {l.checks.soon.length > 0 && <div className="font-semibold text-[#8a5a00]">Coming up soon: {l.checks.soon.join(", ")}</div>}
                  </div>}</td>
                <td className="py-2 text-right whitespace-nowrap">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto w-full sm:w-72 flex flex-col gap-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(i.subtotal)}</span></div>
          <div className="flex justify-between"><span>HST 14%</span><span>{money(i.hst)}</span></div>
          <div className="flex justify-between text-[18px] font-extrabold border-t-2 border-[#0d1b3e] pt-1"><span>Total</span><span>{money(i.total)}</span></div>
        </div>
        <div className="mt-8 text-[13px] text-[#4a5878] flex flex-col gap-1">
          {i.status !== "paid" && <p>Pay by e-transfer to {process.env.ETRANSFER_EMAIL || EMAIL}, or by cheque to Oil Change On The Spot Limited. Please put invoice #{i.invoice_no} in the message.{payReady() ? " You can also pay by card online with the button below." : ""}</p>}
          <p>Thank you for your business.</p>
        </div>
        <div className="mt-6 print:hidden flex flex-wrap gap-3">
          {i.status === "open" && payReady() && <a href={`/pay/${i.token}`} className="h-12 px-5 rounded-xl font-extrabold flex items-center no-underline text-white" style={{ background: "#0d1b3e" }}>Pay {money(i.total)} by card</a>}
          <PrintButton />
        </div>
      </div>
    </div>
  );
}

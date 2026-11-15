// Pay online: for a booking (pay before) or a finished job / cancellation fee (pay after, tip optional).
import { payReady, payTarget, recheckUnconfirmed, PAY_AT_BOOKING_ON } from "@/lib/os/payments";
import { PHONE, PHONE_TEL } from "@/lib/os/business";
import PayBox from "./PayBox";
import { BUSINESS } from "@/lib/os/receipt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay online", robots: { index: false, follow: false } };

const NAVY = "#0d1b3e";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const whenText = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Halifax", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\./g, "");

export default async function PayPage({ params, searchParams }: { params: { token: string }; searchParams: { result?: string } }) {
  let t = await payTarget(params.token).catch(() => null);
  // a card payment Converge hasn't confirmed yet: ask again now; while it's still unconfirmed, no second payment
  const waiting = t && t.due > 0 ? await recheckUnconfirmed({ bookingId: t.bookingId, invoiceId: t.invoiceId, planBillId: t.planBillId }).catch(() => 0) : 0;
  if (t && waiting === 0 && searchParams.result === "pending") t = await payTarget(params.token).catch(() => t);
  const result = waiting > 0 ? "pending" : searchParams.result === "pending" && t && t.due === 0 ? "approved" : searchParams.result;
  return (
    <div className="min-h-[70vh] bg-[#eef1f6] flex justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col gap-4 text-[#0d1b3e]">
        <h1 className="text-[40px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{t && (t.due === 0 || result === "approved") ? "Paid. Thank you!" : "Pay online"}</h1>

        {!t && (
          <div className="bg-white rounded-2xl p-5 flex flex-col gap-2">
            <p className="font-bold text-[17px]">This pay link isn&apos;t valid anymore.</p>
            <p className="text-[#4a5878]">It may already be paid, or the booking changed. Call or text us at <a href={PHONE_TEL} className="font-bold underline">{PHONE}</a> and we&apos;ll sort it out.</p>
          </div>
        )}

        {t && (
          <>
            {result === "approved" && <p className="rounded-xl p-4 font-semibold" style={{ background: "#dff3e6", color: "#1d6b3a" }} role="status">Your payment went through.{t.kind === "job" ? " Your receipt is below, and we've emailed it if we have your email." : t.kind === "invoice" ? " The invoice is marked paid. Thank you!" : t.kind === "plan" ? " Thanks, your plan payment is in." : " See you at your appointment!"}</p>}
            {result === "declined" && t.due > 0 && <p className="rounded-xl p-4 font-semibold" style={{ background: "#fde2e1", color: "#8a1c1c" }} role="alert">Your card was declined, so the payment didn&apos;t go through. You can try again{t.kind === "prepay" ? ", or just pay after the job" : ""}.</p>}
            {result === "pending" && <p className="rounded-xl p-4 font-semibold" style={{ background: "#fff6dd", color: "#8a5a00" }} role="status">We&apos;re confirming your card payment with the bank. Please don&apos;t pay again: if it went through, it&apos;s marked paid here on its own. Questions? Call or text us at {PHONE}.</p>}
            {result === "error" && <p className="rounded-xl p-4 font-semibold" style={{ background: "#fff6dd", color: "#8a5a00" }} role="alert">We couldn&apos;t confirm that payment. Please don&apos;t pay again yet. Call or text us at {PHONE} and we&apos;ll check.</p>}

            <section className="bg-white rounded-2xl p-5 flex flex-col gap-3">
              <div>
                <p className="font-bold text-[19px]">{t.title}{t.firstName ? `, ${t.firstName}` : ""}</p>
                <p className="text-[#4a5878]">{[t.car, t.when ? whenText(t.when) : null].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-col gap-1 text-[15px]">
                {t.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="text-[#4a5878]">{l.label}</span><span>{money(l.amount)}</span></div>)}
                <div className="flex justify-between gap-3 text-[#4a5878] border-t border-[#eef1f6] pt-1 mt-1"><span>HST</span><span>{money(t.hst)}</span></div>
                <div className="flex justify-between gap-3 font-extrabold text-lg"><span>Total</span><span>{money(t.total)}</span></div>
                {t.paid > 0 && <div className="flex justify-between gap-3 text-[#1d6b3a] font-semibold"><span>Paid</span><span>{money(-Math.min(t.paid, t.total))}</span></div>}
              </div>
              {t.due > 0 && result !== "pending" && (payReady()
                ? t.kind === "prepay" ? (PAY_AT_BOOKING_ON ? <PayBox token={t.token} due={t.due} allowTip={false} /> : <p className="rounded-xl p-4 bg-[#fff6dd] text-[15px]">Nothing to pay now. You pay after the job: card, tap, cash or e-transfer when we&apos;re done.</p>) : (
                  <>
                    <div className="rounded-xl p-4 bg-[#fff6dd] text-[15px] flex flex-col gap-1">
                      <p className="font-bold">Preferred: Interac e-Transfer</p>
                      <p>Send <strong>{money(t.due)}</strong> to <strong className="select-all">{BUSINESS.email}</strong></p>
                      <p>In the message, put <strong>{t.ref ? `#${t.ref}` : "your name"}</strong> so we match it to you. It&apos;s marked paid on its own.</p>
                    </div>
                    <p className="text-sm font-bold text-[#4a5878] text-center">Or pay by card</p>
                    <PayBox token={t.token} due={t.due} allowTip={t.kind === "job"} />
                  </>)
                : t.kind === "prepay" ? <p className="rounded-xl p-4 bg-[#fff6dd] text-[15px]">Online card payment isn&apos;t switched on yet. No problem: pay after the job by card, tap, cash or e-transfer.</p>
                : <div className="rounded-xl p-4 bg-[#fff6dd] text-[15px] flex flex-col gap-1">
                    <p className="font-bold">Pay by Interac e-Transfer</p>
                    <p>Send <strong>{money(t.due)}</strong> to <strong className="select-all">{BUSINESS.email}</strong></p>
                    <p>In the message, put <strong>{t.ref ? `#${t.ref}` : "your name"}</strong> so we match it to you.</p>
                    <p className="text-sm text-[#4a5878] mt-1">Questions? Call or text <a href={PHONE_TEL} className="font-bold underline">{PHONE}</a>.</p>
                  </div>)}
              {t.receiptUrl && <a href={t.receiptUrl} className="font-bold underline text-center" style={{ color: NAVY }}>{t.kind === "invoice" ? "See the invoice" : "See the receipt"}</a>}
            </section>
            {t.kind === "prepay" && <p className="text-sm text-[#4a5878] text-center">If we add anything on the day (only with your OK), you pay the difference after the job.</p>}
          </>
        )}
      </div>
    </div>
  );
}

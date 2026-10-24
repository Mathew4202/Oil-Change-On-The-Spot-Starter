import Link from "next/link";
import { NAVY, GOLD, MUTED, LIGHT, PHONE, PHONE_TEL } from "@/components/site/brand";

export const metadata = { title: "Questions people ask us", description: "Payment, travel fees, what oil we use, bringing your own parts, and more." };

const cond = { fontFamily: "var(--font-condensed)" } as const;

function Q({ q, children, open = false, id }: { q: string; children: React.ReactNode; open?: boolean; id?: string }) {
  return (
    <details open={open} id={id} className="group bg-white rounded-2xl border scroll-mt-24" style={{ borderColor: "#c8d0e0" }}>
      <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4 text-[18px] font-bold">
        {q}<span aria-hidden className="text-2xl transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-5 pb-5 flex flex-col gap-3 text-[16px] leading-relaxed" style={{ color: MUTED }}>{children}</div>
    </details>
  );
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[15px] text-[#0d1b3e] border-collapse">
        <thead><tr>{head.map((h) => <th key={h} className="py-2 pr-3 font-bold border-b" style={{ borderColor: "#c8d0e0" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i} className={`py-2 pr-3 border-b ${i === 0 ? "font-semibold" : ""}`} style={{ borderColor: LIGHT }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Faq() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3">
          <h1 className="text-[44px] sm:text-[56px] leading-[0.95] font-extrabold" style={cond}>Questions people ask us</h1>
          <p className="text-[18px] text-white/85">Can&apos;t find yours? Call or text <a href={PHONE_TEL} className="font-bold" style={{ color: GOLD }}>{PHONE}</a>.</p>
        </div>
      </section>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-8" style={{ background: "#fff" }}>
        <section className="flex flex-col gap-3">
          <h2 className="text-[30px] font-extrabold" style={cond}>Booking and payment</h2>
          <Q q="How do I pay?" open>
            <p>Your choice. Pay online by card when you book, or after the job by card, tap, cash or e-transfer. If you pay after, we can also text you a link to pay online.</p>
          </Q>
          <Q q="Do I need an account to book?">
            <p>No. You can book as a guest. If you&apos;ve booked with us before, tap &quot;Booked with us before?&quot; on the booking page and we&apos;ll text you a code, so your car and address fill in on any phone.</p>
          </Q>
          <Q q="How do I cancel or move my appointment?">
            <p>Use the link in your confirmation text, or call or text us. Please give us at least 24 hours&apos; notice so we can offer the time to someone else. Same-day cancellations may have a $30 + HST fee, which we waive for emergencies and bad storms.</p>
          </Q>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[30px] font-extrabold" style={cond}>Where and when</h2>
          <Q q="Is there a travel fee?" open id="travel">
            <p>Travel is free within 30 km. Further out, one fee is added per appointment, and it shows in your price as soon as you enter your address, before you book.</p>
            <Table head={["Driving distance", "Travel fee"]} rows={[["0 to 29.9 km", "Free"], ["30 to 39.9 km", "+$20"], ["40 to 49.9 km", "+$30"], ["50 to 59.9 km", "+$40"], ["Every 10 km after that", "+$10 more"]]} />
          </Q>
          <Q q="Do you come in rain or snow?">
            <p>Yes. Bad weather doesn&apos;t cancel your appointment. We only reschedule if the roads are unsafe, and we&apos;ll call you first.</p>
          </Q>
          <Q q="What do you need from me?">
            <p>A flat spot where we can park next to your car, and the keys. You don&apos;t need to be home if we can reach the car and the keys are left for us. You can pay online or by e-transfer when we text you that it&apos;s done.</p>
          </Q>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[30px] font-extrabold" style={cond}>The oil change</h2>
          <Q q="What oil do you use?">
            <p>Full synthetic, matched to your engine&apos;s exact grade and spec, including the European approvals VW, Audi, BMW, Mercedes and Porsche ask for. A new filter every time.</p>
          </Q>
          <Q q="What's in the inspection?">
            <p>We check your fluid levels, engine and cabin air filters and front wipers, and tell you what we find. Nothing extra is done without your OK.</p>
          </Q>
          <Q q="Can I supply my own oil or filter?">
            <p>Yes, and your price drops. Prices plus HST:</p>
            <Table head={["", "Sedan", "SUV", "3-row SUV", "Truck"]}
              rows={[["Your oil + filter", "$50", "$60", "$70", "$80"], ["Your oil only", "$60", "$70", "$80", "$90"], ["Your filter only", "$80", "$100", "$110", "$120"]]} />
            <p>European and sports cars take longer and need more care, so with your own oil and filter they&apos;re $75 (European sedan), $85 (European SUV), $95 (European large SUV, truck or sports car) and $80 (other sports cars). If you bring only one of the two, we add the cost of the part we supply.</p>
          </Q>
          <Q q="What happens to the old oil?">
            <p>We take it with us and send it for proper recycling. Nothing is left on your driveway.</p>
          </Q>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[30px] font-extrabold" style={cond}>Businesses</h2>
          <Q q="Do you service company vehicles?">
            <p>Yes. We come to your yard and service your vans and trucks there, every make and model. Each vehicle gets its own service record and you get one invoice a month. <Link href="/fleet-request" className="font-bold underline text-[#0d1b3e]">Get fleet pricing</Link></p>
          </Q>
        </section>

        <div className="rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: GOLD }}>
          <p className="text-[28px] font-extrabold leading-none" style={cond}>See your price in 10 seconds.</p>
          <Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold text-white no-underline" style={{ background: NAVY }}>Get my price</Link>
        </div>
      </div>
    </div>
  );
}

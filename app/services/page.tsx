// Every service we offer right now, with the price, and a Book button that opens booking with it picked.
// Prices come from the pricing engine so this page can't drift from what the booking page charges.
import Link from "next/link";
import { OIL_BASE, TIRE_CHANGE, SERVICE_PRICES } from "@/lib/os/pricing-engine";
import { NAVY, GOLD, MUTED, LIGHT, PHONE, PHONE_TEL } from "@/components/site/brand";

export const metadata = {
  title: "Services and prices",
  description: "Mobile oil changes, seasonal tire swaps on rims, diagnostics, filters, wipers and batteries, done at your home or work anywhere in HRM. Every price listed.",
};

const cond = { fontFamily: "var(--font-condensed)" } as const;
const SIZES = ["Sedan", "SUV / crossover", "3-row SUV", "Truck"] as const;
const OWN = { both: [50, 60, 70, 80], oil: [60, 70, 80, 90], filter: [80, 100, 110, 120] };
const SEASONAL = [OIL_BASE.Sedan + TIRE_CHANGE.Sedan - 15, OIL_BASE["SUV/Crossover"] + TIRE_CHANGE["SUV/Crossover"] - 15,
  OIL_BASE["Large SUV"] + TIRE_CHANGE["Large SUV"] - 15, OIL_BASE.Truck + TIRE_CHANGE.Truck - 15];

function Book({ job, add, children = "Book" }: { job: string; add?: string; children?: React.ReactNode }) {
  return <Link href={`/booking?job=${job}${add ? `&add=${add}` : ""}` as never} className="inline-block rounded-xl px-5 py-3 text-[16px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>{children}</Link>;
}

function PriceRow({ prices }: { prices: number[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {SIZES.map((s, i) => (
        <div key={s} className="rounded-xl px-3 py-2" style={{ background: LIGHT }}>
          <dt className="text-sm" style={{ color: MUTED }}>{s}</dt>
          <dd className="text-[24px] font-extrabold leading-tight" style={cond}>${prices[i]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({ id, title, intro, children, cta }: { id: string; title: string; intro: string; children?: React.ReactNode; cta: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 bg-white" style={{ borderColor: "#c8d0e0" }}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[30px] leading-none font-extrabold" style={cond}>{title}</h2>
        <p className="text-[17px] leading-relaxed" style={{ color: MUTED }}>{intro}</p>
      </div>
      {children}
      <div>{cta}</div>
    </section>
  );
}

export default function Services() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3">
          <h1 className="text-[44px] sm:text-[56px] leading-[0.95] font-extrabold" style={cond}>Services and prices</h1>
          <p className="text-[18px] text-white/85 leading-relaxed">Everything is done in your driveway or at work, anywhere in HRM. Prices are before HST, and travel is free within 30 km. Your exact price shows when you book, before you pay anything.</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-5" style={{ background: "transparent" }}>
        <nav aria-label="Jump to a service" className="flex flex-wrap gap-2">
          {[["oil", "Oil change"], ["seasonal", "Seasonal package"], ["tires", "Tire swap"], ["addons", "Filters, wipers, battery"], ["diagnostic", "Diagnostics"], ["own", "Bring your own oil"], ["plans", "Plans and fleets"]].map(([id, t]) => (
            <a key={id} href={`#${id}`} className="rounded-full border px-4 py-2 font-semibold text-[15px] no-underline" style={{ borderColor: "#c8d0e0" }}>{t}</a>
          ))}
        </nav>

        <Card id="oil" title="Full synthetic oil change" cta={<Book job="oil_change">Book an oil change</Book>}
          intro="The right full synthetic oil for your engine, a new filter, and a quick check of your fluids, air filters and wipers. We show you what we find, and nothing gets added without your OK.">
          <PriceRow prices={[OIL_BASE.Sedan, OIL_BASE["SUV/Crossover"], OIL_BASE["Large SUV"], OIL_BASE.Truck]} />
          <p className="text-[15px] leading-relaxed" style={{ color: MUTED }}>European cars, sports cars and diesels are priced from the exact oil and filter they need, so they cost more. A few cars that take a lot of oil or a pricey filter are a little higher. You always see your exact price before you book.</p>
        </Card>

        <Card id="seasonal" title="Seasonal package" cta={<Book job="seasonal">Book the package</Book>}
          intro="Oil change plus your tire swap in one visit, $15 off. Offered at the start of winter and summer. Tires must already be on their own rims.">
          <PriceRow prices={SEASONAL} />
        </Card>

        <Card id="tires" title="Tire swap on rims" cta={<Book job="tires">Book a tire swap</Book>}
          intro="We swap all four wheels with tires already on rims, set the pressures and torque the wheel nuts. Added to an oil change it's $10 off the rest of the year (or the seasonal package in season).">
          <PriceRow prices={[TIRE_CHANGE.Sedan, TIRE_CHANGE["SUV/Crossover"], TIRE_CHANGE["Large SUV"], TIRE_CHANGE.Truck]} />
          <p className="text-[15px]" style={{ color: MUTED }}>Oversized or heavy-duty wheels: <a href={PHONE_TEL} className="font-bold underline">call or text</a> for a price. We don&apos;t mount tires onto rims.</p>
        </Card>

        <Card id="addons" title="Filters, wipers and batteries" cta={<div className="flex flex-wrap gap-2"><Book job="oil_change">Add to an oil change</Book><Book job="parts">Book on their own</Book></div>}
          intro="Parts are charged at the regular store price. Labour is cheaper when we're already there for an oil change.">
          <div className="overflow-x-auto">
            <table className="w-full text-[16px]">
              <thead><tr className="text-left text-sm" style={{ color: MUTED }}><th className="py-2 pr-3 font-semibold">Service</th><th className="py-2 pr-3 font-semibold">With an oil change</th><th className="py-2 font-semibold">On its own</th></tr></thead>
              <tbody>
                {[
                  ["Engine air filter", `$${SERVICE_PRICES.addonFilter} + filter`, `$${SERVICE_PRICES.standaloneCallout} + filter`],
                  ["Cabin air filter", `from $${SERVICE_PRICES.addonFilter} + filter`, `$${SERVICE_PRICES.standaloneCallout} + filter`],
                  ["Front wiper blades", `$${SERVICE_PRICES.addonWipers} + blades`, `$${SERVICE_PRICES.standaloneCallout} + blades`],
                  ["Battery replacement", `$${SERVICE_PRICES.batteryWithOilChange} + battery`, `$${SERVICE_PRICES.standaloneCallout} + battery`],
                  ["Washer fluid top-up", "$5", "$10"],
                  ["Coolant top-up", "Priced by type and amount", "Priced by type and amount"],
                ].map(([a, b, c]) => (
                  <tr key={a} className="border-t" style={{ borderColor: "#eef1f6" }}><td className="py-2 pr-3 font-semibold">{a}</td><td className="py-2 pr-3">{b}</td><td className="py-2">{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[15px]" style={{ color: MUTED }}>Cabin filters that take extra time to reach cost a bit more, and we tell you before we start. Not sure your battery is the problem? Book a diagnostic instead.</p>
        </Card>

        <Card id="diagnostic" title="Diagnostics" cta={<Book job="diagnostic">Book a diagnostic</Book>}
          intro={`$${SERVICE_PRICES.diagnostic} to come out and find the problem: warning lights, no-starts, strange noises. It's charged on its own, even if the car can't be fixed on the spot.`}>
          <p className="text-[16px] leading-relaxed" style={{ color: MUTED }}>If it&apos;s a straightforward fix we can do in the driveway, repairs are ${SERVICE_PRICES.labourPerHour} an hour plus parts, and only with your OK. Bigger jobs we&apos;ll point you to a shop we trust. We don&apos;t do brakes.</p>
        </Card>

        <Card id="own" title="Bring your own oil or filter" cta={<Book job="oil_change" add="own">Book with your own oil</Book>}
          intro="Already bought your oil or filter? We'll put it in. It has to be the right oil and filter for your car.">
          <div className="overflow-x-auto">
            <table className="w-full text-[16px] min-w-[460px]">
              <thead><tr className="text-left text-sm" style={{ color: MUTED }}><th className="py-2 pr-3 font-semibold">You bring</th>{SIZES.map((s) => <th key={s} className="py-2 pr-3 font-semibold">{s}</th>)}</tr></thead>
              <tbody>
                {([["Oil and filter", OWN.both], ["Oil only", OWN.oil], ["Filter only", OWN.filter]] as const).map(([t, p]) => (
                  <tr key={t} className="border-t" style={{ borderColor: "#eef1f6" }}><td className="py-2 pr-3 font-semibold">{t}</td>{p.map((x, i) => <td key={i} className="py-2 pr-3">${x}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[15px]" style={{ color: MUTED }}>European cars, sports cars and diesels are priced separately, shown when you book.</p>
        </Card>

        <section id="plans" className="scroll-mt-24 grid sm:grid-cols-2 gap-4">
          <Link href={"/maintenance-plan" as never} className="rounded-2xl p-5 flex flex-col gap-2 no-underline text-white" style={{ background: NAVY }}>
            <span className="text-[26px] font-extrabold leading-none" style={cond}>Maintenance plan</span>
            <span className="text-white/80">Drive a lot? Your oil changes for one monthly price, worked out for your car. Filter and wiper labour free.</span>
            <span className="font-extrabold mt-auto" style={{ color: GOLD }}>See your monthly price ›</span>
          </Link>
          <Link href={"/fleet-request" as never} className="rounded-2xl p-5 flex flex-col gap-2 no-underline text-white" style={{ background: NAVY }}>
            <span className="text-[26px] font-extrabold leading-none" style={cond}>Fleets</span>
            <span className="text-white/80">Vans and trucks serviced at your yard, a record for each vehicle and one invoice a month.</span>
            <span className="font-extrabold mt-auto" style={{ color: GOLD }}>Get fleet pricing ›</span>
          </Link>
        </section>

        <p className="text-[16px]" style={{ color: MUTED }}>Further than 30 km? A travel fee starting at $20 is added automatically when you enter your address. <Link href={"/faq#travel" as never} className="font-bold underline">See travel fees</Link>. Something not listed? Call or text <a href={PHONE_TEL} className="font-bold underline">{PHONE}</a>.</p>
      </div>
    </div>
  );
}

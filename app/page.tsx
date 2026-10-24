import Image from "next/image";
import Link from "next/link";
import QuickPrice from "@/components/site/QuickPrice";
import Reviews from "@/components/site/Reviews";
import ScrollPhotos from "@/components/site/ScrollPhotos";
import { NAVY, GOLD, MUTED, LIGHT, PHONE, PHONE_TEL } from "@/components/site/brand";

export const revalidate = 3600;
export const metadata = {
  title: { absolute: "Mobile Oil Change in Halifax and Dartmouth | Oil Change On The Spot" },
  description: "Full synthetic oil change done in your driveway or at work, anywhere in HRM. See your exact price and book a time in under a minute.",
};

const H2 = "text-[34px] sm:text-[44px] leading-[0.95] font-extrabold";
const cond = { fontFamily: "var(--font-condensed)" } as const;

function Cta({ children = "Get my price", href = "/booking" }: { children?: React.ReactNode; href?: string }) {
  return <Link href={href as never} className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>{children}</Link>;
}

export default function Home() {
  return (
    <div className="text-[#0d1b3e]" id="top">
      {/* Hero */}
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14 grid lg:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-5">
            <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>MOBILE OIL CHANGES ACROSS HRM</p>
            <h1 className="text-[44px] sm:text-[60px] leading-[0.92] font-extrabold" style={cond}>Full synthetic oil change, done in your driveway.</h1>
            <p className="text-[18px] leading-relaxed text-white/85 max-w-xl">Pick your car, see your exact price, and choose a time. We bring everything to your home or work. No shop, no waiting room.</p>
            <QuickPrice />
            <p className="text-white/80">Rather talk to us? Call or text <a href={PHONE_TEL} className="font-bold" style={{ color: GOLD }}>{PHONE}</a></p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative col-span-2 aspect-[4/3] rounded-2xl overflow-hidden">
              <Image src="/gallery/work-12.png" alt="Technician pouring fresh oil into an engine" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
            </div>
            <div className="relative aspect-square rounded-2xl overflow-hidden">
              <Image src="/gallery/work-05.webp" alt="Oil change in progress on a white Hyundai" fill sizes="(min-width: 1024px) 280px, 50vw" className="object-cover" />
            </div>
            <div className="relative aspect-square rounded-2xl overflow-hidden">
              <Image src="/gallery/work-18.png" alt="Oil change on a car parked in a driveway" fill sizes="(min-width: 1024px) 280px, 50vw" className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Why us */}
      <section aria-label="Why customers pick us" style={{ background: GOLD }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-extrabold text-[17px]">
          <p>5-star Google reviews</p><p>Full synthetic every time</p><p>Free travel within 30 km</p><p>Pay online or after</p>
        </div>
      </section>

      {/* Real jobs: full-screen photos that fly in as you scroll */}
      <ScrollPhotos />

      {/* How it works */}
      <section aria-label="How it works" style={{ background: LIGHT }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-8">
          <h2 className={H2} style={cond}>Booked in under a minute</h2>
          <ol className="grid md:grid-cols-3 gap-4">
            {[
              ["Pick your car", "Year, make and model. Not sure of the engine? Pick \"Not sure\" and we check when we arrive."],
              ["See your price, pick a time", "Your exact price shows before you book, travel included. Choose any open slot and it's yours right away."],
              ["We come to you", "Oil, filter and a quick check of fluids, filters and wipers. Pay online when you book, or by card, tap, cash or e-transfer when we're done."],
            ].map(([t, d], i) => (
              <li key={t} className="bg-white rounded-2xl p-5 flex flex-col gap-2">
                <p className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-[18px]" style={{ background: GOLD }}>{i + 1}</p>
                <h3 className="text-[22px] font-bold">{t}</h3>
                <p className="text-[16px] leading-relaxed" style={{ color: MUTED }}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Services and prices */}
      <section id="services" aria-label="Services and prices" className="scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-8">
          <div>
            <h2 className={H2} style={cond}>Services and prices</h2>
            <p className="mt-2 text-[17px]" style={{ color: MUTED }}>All prices plus HST. Your exact price shows when you pick your car.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border-2 p-5 flex flex-col gap-3" style={{ borderColor: NAVY }}>
              <h3 className="text-[24px] font-bold">Full synthetic oil change</h3>
              <p className="text-[36px] font-extrabold leading-none" style={cond}>from $90</p>
              <p className="leading-relaxed" style={{ color: MUTED }}>Sedan $90 · SUV $110 · 3-row SUV $120 · Truck $130. European and sports cars are priced on the exact oil they need. Includes the right oil, a new filter and a basic inspection.</p>
              <div className="mt-auto pt-2"><Cta>Book an oil change</Cta></div>
            </div>
            <div className="rounded-2xl p-5 flex flex-col gap-3 relative" style={{ background: "#fff6dd", border: `2px solid ${GOLD}` }}>
              <p className="absolute -top-3 left-5 rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: GOLD }}>SAVE $15</p>
              <h3 className="text-[24px] font-bold">Seasonal package</h3>
              <p className="text-[36px] font-extrabold leading-none" style={cond}>from $155</p>
              <p className="leading-relaxed" style={{ color: MUTED }}>Oil change plus a swap of tires already on their own rims, pressures set and wheels torqued. Offered at the start of winter and summer. Any other time, tires added to an oil change are $10 off.</p>
              <div className="mt-auto pt-2"><Cta>Book the package</Cta></div>
            </div>
            <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ borderColor: "#c8d0e0" }}>
              <h3 className="text-[24px] font-bold">Everything else</h3>
              <p className="text-[36px] font-extrabold leading-none" style={cond}>from $50</p>
              <p className="leading-relaxed" style={{ color: MUTED }}>Diagnostics $100 · On-rim tire swap from $80 · Battery, wipers or air filters on their own from $50 + parts. Added to an oil change: wipers $15, air filters $10 + parts, washer fluid $5.</p>
              <div className="mt-auto pt-2"><Cta>See all services</Cta></div>
            </div>
          </div>
          <Link href={"/maintenance-plan" as never} className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-underline text-white" style={{ background: NAVY }}>
            <span><span className="block text-[24px] font-extrabold" style={cond}>Drive a lot? Get a maintenance plan.</span>
              <span className="block text-white/80">Your oil changes for one monthly price, worked out for your car. Filter and wiper labour free.</span></span>
            <span className="font-extrabold whitespace-nowrap" style={{ color: GOLD }}>See your monthly price ›</span>
          </Link>
        </div>
      </section>

      {/* Fleets */}
      <section id="fleet" aria-label="Fleet service" className="scroll-mt-20 text-white" style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-[2fr_1fr] gap-6 items-center">
          <div className="flex flex-col gap-3">
            <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>FOR BUSINESSES</p>
            <h2 className={H2} style={cond}>Your vans stay at your yard.</h2>
            <p className="text-[18px] leading-relaxed text-white/85">We service your whole fleet on site, every make and model. Each vehicle gets its own service record, we tell you when it&apos;s due, and you get one invoice a month.</p>
          </div>
          <div><Cta href="/fleet-request">Get fleet pricing</Cta></div>
        </div>
      </section>

      <Reviews />

      {/* Service area */}
      <section id="area" aria-label="Service area" className="scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col gap-3">
            <h2 className={H2} style={cond}>Where we go</h2>
            <p className="text-[18px] leading-relaxed" style={{ color: MUTED }}>All of HRM. Travel is free within 30 km. Further out, a small travel fee is added to your price automatically when you enter your address, before you book.</p>
            <p><Link href={"/faq#travel" as never} className="font-bold underline">See the travel fees</Link></p>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {["Dartmouth", "Halifax", "Bedford", "Sackville", "Cole Harbour", "Clayton Park", "Eastern Passage", "Fall River", "Timberlea"].map((t) => (
              <li key={t} className="rounded-xl px-3 py-3 font-bold text-center" style={{ background: LIGHT }}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Book */}
      <section aria-label="Book now" style={{ background: GOLD }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <h2 className={H2} style={cond}>Skip the shop this time.</h2>
          <Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline text-white" style={{ background: NAVY }}>Get my price</Link>
        </div>
      </section>
    </div>
  );
}

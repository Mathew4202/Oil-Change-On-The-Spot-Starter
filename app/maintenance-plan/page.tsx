import Link from "next/link";
import PlanCalculator from "./PlanCalculator";
import { NAVY, GOLD, MUTED, LIGHT } from "@/components/site/brand";

export const metadata = { title: "Maintenance plan", description: "Oil changes on a schedule for one monthly price. Priced for your car and how much you drive, anywhere in HRM." };
const cond = { fontFamily: "var(--font-condensed)" } as const;

const TERMS = [
  "12-month plan, billed monthly plus HST.",
  "Up to one oil change a month, booked whenever suits you.",
  "Filter and wiper labour is free. You only pay for the part.",
  "Small top-ups included (washer fluid, small coolant top-ups). Very low coolant or brake fluid gets flagged as a possible leak.",
  "Seasonal swaps are for winter tires already on their own rims.",
  "Please give 24 hours' notice to cancel or move a visit.",
  "Leaving before 12 months: you pay the regular price for the services you've had, minus the plan payments you've made.",
];

export default function MaintenancePlan() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3 max-w-3xl">
          <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>FOR PEOPLE WHO DRIVE A LOT</p>
          <h1 className="text-[44px] sm:text-[58px] leading-[0.95] font-extrabold" style={cond}>Your oil changes, one monthly price.</h1>
          <p className="text-[18px] leading-relaxed text-white/85">Priced for your car and how often you need us. No sign-up fee, no surprises. You book each visit like normal and we come to you.</p>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10"><PlanCalculator /></section>
      <section style={{ background: LIGHT }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-[34px] font-extrabold" style={cond}>How the price is worked out</h2>
            <p className="leading-relaxed" style={{ color: MUTED }}>We count the oil changes you need in a year. Each one is $5 under our regular price for your car, then the year is split into 12 monthly payments. On a few cars where the regular price is already as low as it goes, the price stays the same and your perk is free filter and wiper labour.</p>
            <p className="leading-relaxed" style={{ color: MUTED }}>Driving less? A plan doesn&apos;t save much if you only need us every few months. Just <Link href="/booking" className="font-bold underline text-[#0d1b3e]">book when you need us</Link> and we&apos;ll text you when you&apos;re due.</p>
          </div>
          <div className="bg-white rounded-2xl p-5 flex flex-col gap-2">
            <h2 className="text-[26px] font-extrabold" style={cond}>The plan terms</h2>
            <ul className="flex flex-col gap-2">
              {TERMS.map((t) => <li key={t} className="flex gap-3 leading-relaxed"><span aria-hidden className="font-extrabold" style={{ color: GOLD }}>✓</span><span>{t}</span></li>)}
            </ul>
            <p className="text-sm mt-1" style={{ color: MUTED }}>You agree by replying I AGREE to our text before the plan starts.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

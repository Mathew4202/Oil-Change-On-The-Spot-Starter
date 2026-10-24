// Fleet pricing request: what fleets get from us, and a short form that goes straight to both owners.
import FleetRequestClient from "./FleetRequestClient";
import { NAVY, GOLD, MUTED, LIGHT, PHONE, PHONE_TEL } from "@/components/site/brand";

export const metadata = {
  title: "Fleet maintenance",
  description: "Oil changes and preventative maintenance for company vans and trucks, done at your yard anywhere in HRM. Per-vehicle records and one invoice a month.",
};
const cond = { fontFamily: "var(--font-condensed)" } as const;

export default function FleetPage() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3">
          <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>FOR BUSINESSES</p>
          <h1 className="text-[44px] sm:text-[56px] leading-[0.95] font-extrabold" style={cond}>Your vans stay at your yard.</h1>
          <p className="text-[18px] text-white/85 leading-relaxed max-w-2xl">We service your vehicles on site, so nobody loses a day driving to a shop and waiting. Tell us about your fleet and we&apos;ll send you a written price for each vehicle.</p>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
        <div className="flex flex-col gap-4">
          <h2 className="text-[30px] font-extrabold leading-none" style={cond}>What you get</h2>
          {[
            ["A price for every vehicle", "Worked out from each vehicle's oil and filter, in writing, before we start. No contract."],
            ["Start small", "Try us on 3 or 4 vehicles first. If it works for you, we set up a regular schedule."],
            ["Records for each vehicle", "Every visit is logged with the odometer and what we found, and we tell you when each one is due."],
            ["One invoice a month", "One bill for every vehicle we serviced that month."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl p-4" style={{ background: LIGHT }}>
              <p className="font-bold text-[18px]">{t}</p><p className="leading-relaxed" style={{ color: MUTED }}>{d}</p>
            </div>
          ))}
          <p style={{ color: MUTED }}>Rather talk first? Call or text <a href={PHONE_TEL} className="font-bold underline">{PHONE}</a>.</p>
        </div>
        <FleetRequestClient />
      </div>
    </div>
  );
}

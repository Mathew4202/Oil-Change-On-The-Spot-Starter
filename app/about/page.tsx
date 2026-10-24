import Image from "next/image";
import Link from "next/link";
import { NAVY, GOLD, MUTED, LIGHT } from "@/components/site/brand";

export const metadata = { title: "About us", description: "Two guys from Dartmouth who bring the oil change to your driveway, anywhere in HRM." };
const cond = { fontFamily: "var(--font-condensed)" } as const;

const TEAM = [
  { name: "Mathew Akunyili", role: "Co-founder and technician", img: "/images/team/matt.png" },
  { name: "Harsh Bahorun", role: "Co-founder and technician", img: "/images/team/harsh.png" },
];
const PROMISES: [string, string][] = [
  ["Registered and insured", "Oil Change On The Spot Limited is a registered Nova Scotia business with commercial insurance."],
  ["The right oil for your car", "Full synthetic matched to your engine's spec, and a new filter every time."],
  ["Nothing added without your OK", "We check fluids, filters and wipers and tell you what we find. You decide if anything else gets done."],
  ["Rain or snow, we still come", "Bad weather doesn't cancel your appointment. We put mats down and get it done."],
];

export default function About() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-4">
          <h1 className="text-[42px] sm:text-[58px] leading-[0.95] font-extrabold" style={cond}>Two guys from Dartmouth who think an oil change shouldn&apos;t cost you your day.</h1>
          <p className="text-[18px] leading-relaxed text-white/85 max-w-2xl">We started Oil Change On The Spot in 2025 so people could skip the shop and the waiting room. We bring everything to your driveway or workplace, anywhere in HRM.</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-6">
        <h2 className="text-[34px] font-extrabold" style={cond}>Who shows up</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {TEAM.map((t) => (
            <article key={t.name} className="rounded-2xl overflow-hidden" style={{ background: LIGHT }}>
              <div className="relative aspect-square"><Image src={t.img} alt={t.name} fill sizes="(min-width: 640px) 440px, 100vw" className="object-cover" /></div>
              <div className="p-5"><h3 className="text-[24px] font-bold">{t.name}</h3><p style={{ color: MUTED }}>{t.role}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ background: LIGHT }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-6">
          <h2 className="text-[34px] font-extrabold" style={cond}>What you can count on</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {PROMISES.map(([t, d]) => (
              <div key={t} className="bg-white rounded-2xl p-5 flex flex-col gap-2">
                <h3 className="text-[20px] font-bold">{t}</h3><p className="leading-relaxed" style={{ color: MUTED }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: GOLD }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <h2 className="text-[34px] font-extrabold leading-none" style={cond}>See your price in 10 seconds.</h2>
          <Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold text-white no-underline" style={{ background: NAVY }}>Get my price</Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import type { Route } from "next";
import { NAVY, GOLD, PHONE, PHONE_TEL, EMAIL } from "./brand";

const LINKS: [string, string][] = [["/booking", "Book"], ["/services", "Services and prices"], ["/faq", "FAQ"], ["/about", "About us"], ["/fleet-request", "Fleets"], ["/fleet-login", "Fleet login"], ["/maintenance-plan", "Maintenance plan"],
  ["/gallery", "Gallery"], ["/contact", "Contact"], ["/privacy", "Privacy"], ["/terms", "Terms"]];

export default function SiteFooter() {
  return (
    <footer className="text-white" style={{ background: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6 md:flex-row md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[22px] font-extrabold tracking-wide" style={{ fontFamily: "var(--font-condensed)" }}>OIL CHANGE ON THE SPOT</p>
          <p className="text-white/80">Oil Change On The Spot Limited · Dartmouth, NS</p>
          <p><a href={PHONE_TEL} className="font-bold" style={{ color: GOLD }}>{PHONE}</a> <span className="text-white/60">·</span> <a href={`mailto:${EMAIL}`} className="text-white/90">{EMAIL}</a></p>
          <p className="text-white/60 text-sm">Book online any time. Open times show when you pick a day.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 text-[15px]">
          {LINKS.map(([h, t]) => <Link key={h} href={h as Route} className="text-white/85 hover:text-white">{t}</Link>)}
        </nav>
      </div>
    </footer>
  );
}

"use client";
// The Christmas deal ($10 off every oil change, Dec 1 to Jan 1, every year). Shows by itself in that window only.
// The discount itself is applied on the server (lib/os/deals.ts), so these are just the signs. Add ?xmas=1 to preview.
import { useEffect, useState } from "react";
import Link from "next/link";
import { inChristmas } from "@/lib/os/deals";
import { NAVY, GOLD } from "./brand";

function useChristmas() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
    setOn(inChristmas(today) || new URLSearchParams(window.location.search).get("xmas") === "1");
  }, []);
  return on;
}

/** Thin strip at the very top of every page. */
export function ChristmasStrip() {
  const on = useChristmas();
  if (!on) return null;
  return (
    <div className="text-center text-[14px] sm:text-[15px] font-bold px-3 py-1.5" style={{ background: GOLD, color: NAVY }}>
      Christmas deal: $10 off every oil change, Dec 1 to Jan 1. No code needed.{" "}
      <Link href="/booking" className="underline whitespace-nowrap" style={{ color: NAVY }}>Book now</Link>
    </div>
  );
}

/** The poster and the details, on the home page. */
export function ChristmasSection() {
  const on = useChristmas();
  if (!on) return null;
  return (
    <section aria-label="Christmas deal" className="text-white" style={{ background: "radial-gradient(900px 500px at 20% 0%, #1d3577 0%, #0d1b3e 60%, #070f26 100%)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-[1fr_420px] gap-8 items-center">
        <div className="flex flex-col gap-4">
          <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>CHRISTMAS DEAL · DEC 1 TO JAN 1</p>
          <h2 className="text-[44px] sm:text-[60px] leading-[0.92] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>$10 off every full synthetic oil change.</h2>
          <p className="text-[18px] leading-relaxed text-white/85 max-w-xl">For visits from December 1 to January 1, $10 comes off your price by itself. No code, nothing to clip. Booking two cars? It comes off each one.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>See my Christmas price</Link>
            <a href="/promo/christmas-deal.jpg" download className="inline-block rounded-xl px-6 py-4 text-[18px] font-bold no-underline border border-white/40 text-white">Share the poster</a>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/promo/christmas-deal-720.jpg" alt="Christmas deal: $10 off every full synthetic oil change, December 1 to January 1. We come to you." width={720} height={900}
          className="w-full max-w-[420px] mx-auto rounded-2xl shadow-2xl" />
      </div>
    </section>
  );
}

"use client";
// Website header: logo, menu, and "Book now" always in reach.
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { NAVY, GOLD, PHONE, PHONE_TEL } from "./brand";

const LINKS: [string, string][] = [["/#services", "Services and prices"], ["/#fleet", "Fleets"], ["/#reviews", "Reviews"], ["/#area", "Service area"], ["/faq", "FAQ"], ["/about", "About us"]];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 text-white" style={{ background: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 no-underline text-white" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Oil Change On The Spot logo" width={52} height={52} className="w-[52px] h-[52px] object-contain" />
          <span className="hidden sm:inline lg:hidden xl:inline text-[22px] font-extrabold tracking-wide whitespace-nowrap" style={{ fontFamily: "var(--font-condensed)" }}>OIL CHANGE ON THE SPOT</span>
        </Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-5 text-[15px] font-semibold whitespace-nowrap">
          {LINKS.map(([h, t]) => <Link key={h} href={h as Route} className="text-white/90 hover:text-white">{t}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={PHONE_TEL} className="hidden md:inline lg:hidden 2xl:inline text-white font-semibold mr-2 whitespace-nowrap">{PHONE}</a>
          <Link href="/booking" className="rounded-[10px] px-4 sm:px-5 py-3 font-extrabold text-[16px] no-underline whitespace-nowrap" style={{ background: GOLD, color: NAVY }}>Book now</Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
            className="lg:hidden w-12 h-12 rounded-[10px] border border-white/30 flex items-center justify-center">
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Main" className="lg:hidden border-t border-white/15 px-4 pb-4 flex flex-col">
          {LINKS.map(([h, t]) => <Link key={h} href={h as Route} onClick={() => setOpen(false)} className="py-3 text-[18px] font-semibold text-white border-b border-white/10">{t}</Link>)}
          <Link href="/booking" onClick={() => setOpen(false)} className="py-3 text-[18px] font-semibold text-white border-b border-white/10">Sign in</Link>
          <a href={PHONE_TEL} className="py-3 text-[18px] font-bold" style={{ color: GOLD }}>Call or text {PHONE}</a>
        </nav>
      )}
    </header>
  );
}

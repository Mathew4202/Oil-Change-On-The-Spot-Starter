"use client";
// Website header (approved design): logo, "Book now" always visible, and a hamburger menu on every screen size.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { NAVY, GOLD, PHONE, PHONE_TEL } from "./brand";

const LINKS: [string, string][] = [["/#services", "Services and prices"], ["/maintenance-plan", "Maintenance plan"], ["/#fleet", "Fleets"], ["/#reviews", "Reviews"],
  ["/#area", "Service area"], ["/faq", "FAQ"], ["/about", "About us"], ["/booking", "Sign in"]];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <header className="sticky top-0 z-50 text-white" style={{ background: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 no-underline text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Oil Change On The Spot logo" width={52} height={52} className="w-[52px] h-[52px] object-contain" />
          <span className="hidden sm:inline text-[22px] font-extrabold tracking-wide whitespace-nowrap" style={{ fontFamily: "var(--font-condensed)" }}>OIL CHANGE ON THE SPOT</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/booking" className="rounded-[10px] px-4 sm:px-5 py-3 font-extrabold text-[16px] no-underline whitespace-nowrap" style={{ background: GOLD, color: NAVY }}>Book now</Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="site-menu"
            className="w-12 h-12 rounded-[10px] border border-white/30 flex items-center justify-center hover:bg-white/10">
            <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 top-[76px] bg-black/40 cursor-default" onClick={() => setOpen(false)} />
          <nav id="site-menu" aria-label="Main" className="absolute right-0 left-0 sm:left-auto sm:right-6 sm:w-[340px] sm:rounded-b-2xl border-t border-white/15 px-5 pb-5 flex flex-col shadow-2xl" style={{ background: NAVY }}>
            {LINKS.map(([h, t]) => <Link key={h} href={h as Route} onClick={() => setOpen(false)} className="py-3 text-[18px] font-semibold text-white border-b border-white/10 hover:text-[#f2b01e]">{t}</Link>)}
            <a href={PHONE_TEL} className="pt-4 text-[18px] font-bold" style={{ color: GOLD }}>Call or text {PHONE}</a>
          </nav>
        </>
      )}
    </header>
  );
}

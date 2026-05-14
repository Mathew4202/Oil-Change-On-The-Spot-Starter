'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
        <img src="/logo.svg" alt="logo" className="h-20 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/contact" className="hover:underline">Contact</Link>
          <Link href="/services" className="hover:underline">Services</Link>
          <Link href="/about" className="hover:underline">About Us</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/terms" className="hover:underline">Terms</Link>
          {/* In NavBar links */}
          <Link href="/gallery" className="hover:underline">Gallery</Link>
          <Link href="/memberships" className="mt-1 inline-flex w-max px-3 py-1 rounded-lg bg-brand hover:bg-brand-light text-white font-semibold">
            Maintenance Plans
          </Link>


          <Link href="/request" className="px-3 py-1 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Request a Quote
          </Link>

          
          

        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-md border border-slate-300"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <div className="space-y-1.5">
            <span className="block h-0.5 w-5 bg-slate-800" />
            <span className="block h-0.5 w-5 bg-slate-800" />
            <span className="block h-0.5 w-5 bg-slate-800" />
          </div>
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <nav className="container py-3 flex flex-col gap-3">
            <Link href="/contact" onClick={() => setOpen(false)} className="hover:underline">Contact</Link>
            <Link href="/services" onClick={() => setOpen(false)} className="hover:underline">Services</Link>
            <Link href="/about" className="hover:underline">About Us</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/terms" className="hover:underline">Terms</Link>
          {/* In NavBar links */}
<Link href="/gallery" className="hover:underline">Gallery</Link>

<Link href="/memberships" className="mt-1 inline-flex w-max px-3 py-1 rounded-lg bg-brand hover:bg-brand-light text-white font-semibold">
            Maintenance Plans
          </Link>
            <Link
              href="/request"
              onClick={() => setOpen(false)}
              className="mt-1 inline-flex w-max px-3 py-1 rounded-lg bg-brand hover:bg-brand-light text-white font-semibold"
            >
              Request a Quote
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

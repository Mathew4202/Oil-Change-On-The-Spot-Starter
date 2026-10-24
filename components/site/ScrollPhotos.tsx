"use client";
// One full-screen section of real job photos that fly in as you scroll (Harsh's idea).
// People whose phone is set to "reduce motion" get the same photos, still, with no movement.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NAVY, GOLD } from "./brand";

// where each photo lands (percent of the screen) and where it flies in from
const PHOTOS = [
  { src: "/gallery/work-17.png", alt: "Oil change on a red pickup in a parking garage", box: [3, 9, 52, 34], from: [-60, 20, -8] },
  { src: "/gallery/work-19.png", alt: "Oil change on a Jeep in a driveway", box: [57, 12, 40, 28], from: [60, -10, 7] },
  { src: "/gallery/work-07.webp", alt: "Oil change on a blue Ford pickup", box: [6, 45, 38, 26], from: [-50, 40, 6] },
  { src: "/gallery/work-22.png", alt: "Oil change on a Volkswagen in a driveway", box: [47, 42, 50, 30], from: [50, 50, -6] },
  { src: "/gallery/work-15.png", alt: "Oil change on a Honda in a driveway", box: [26, 24, 46, 32], from: [0, 80, 0] },
];
const LINES = [
  { at: 0, kicker: "REAL JOBS, NOT STOCK PHOTOS", title: "At home, at work, in the parking garage." },
  { at: 0.55, title: "We bring the oil, the filter and the mess kit.", text: "Mats down, old oil taken away, nothing left on your driveway." },
  { at: 0.8, title: "You keep your day. We do the oil change.", cta: true },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function ScrollPhotos() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setStill(m.matches); set(); m.addEventListener("change", set);
    let raf = 0;
    const tick = () => {
      raf = 0; const el = ref.current; if (!el) return;
      // 0 when the section's top edge comes into view, 1 when its bottom edge reaches the bottom of the screen,
      // so the first photos are already flying in while the section slides up (no empty screen)
      const r = el.getBoundingClientRect();
      setP(r.height > 0 ? clamp((window.innerHeight - r.top) / r.height) : 1);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { m.removeEventListener("change", set); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const line = [...LINES].reverse().find((l) => (still ? 1 : p) >= l.at) ?? LINES[0];
  return (
    <section ref={ref} aria-label="Real jobs" style={{ height: still ? "auto" : "330vh", background: NAVY }}>
      <div className={still ? "relative h-[100svh] min-h-[640px] overflow-hidden" : "sticky top-0 h-[100svh] min-h-[560px] overflow-hidden"}>
        {PHOTOS.map((ph, i) => {
          const t = still ? 1 : ease(clamp((p - 0.08 - i * 0.11) / 0.2));
          const [x, y, w, h] = ph.box, [fx, fy, rot] = ph.from;
          return (
            <div key={ph.src} className="absolute rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/90"
              style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, opacity: t, zIndex: i,
                transform: `translate(${fx * (1 - t)}vw, ${fy * (1 - t)}vh) rotate(${rot * (1 - t) + (i % 2 ? 2 : -2)}deg) scale(${0.8 + 0.2 * t})`,
                willChange: still ? undefined : "transform, opacity" }}>
              <Image src={ph.src} alt={ph.alt} fill sizes="(min-width: 768px) 50vw, 60vw" className="object-cover" />
            </div>
          );
        })}
        <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none" style={{ background: `linear-gradient(to top, ${NAVY} 30%, rgba(13,27,62,0.75) 65%, rgba(13,27,62,0))`, zIndex: 10 }} />
        <div className="absolute inset-x-0 bottom-0 z-20 max-w-6xl mx-auto px-4 sm:px-6 pb-10 text-white" aria-live="polite">
          <div key={line.title} className="flex flex-col gap-3 max-w-2xl motion-safe:animate-[fadeUp_0.5s_ease-out]">
            {line.kicker && <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>{line.kicker}</p>}
            <h2 className="text-[38px] sm:text-[56px] leading-[0.95] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{line.title}</h2>
            {line.text && <p className="text-[18px] text-white/85">{line.text}</p>}
            {line.cta && <div><Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>Get my price</Link></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

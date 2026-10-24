"use client";
// Real job photos that fly in as you scroll past them (Harsh's idea).
// The page never pins or pauses: each photo animates while it moves into view during normal scrolling,
// so the section is only as tall as its content and the rest of the page follows right after.
// People whose phone is set to "reduce motion" get the same photos with no movement.
import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { NAVY, GOLD } from "./brand";

type Photo = { src: string; alt: string; from: [number, number, number] };   // fly in from x vw, y px, rotate deg
type Block = { kicker?: string; title: string; text?: string; cta?: boolean; photos: Photo[] };

const BLOCKS: Block[] = [
  { kicker: "REAL JOBS, NOT STOCK PHOTOS", title: "At home, at work, in the parking garage.",
    photos: [
      { src: "/gallery/work-17.png", alt: "Oil change on a red pickup in a parking garage", from: [-40, 60, -8] },
      { src: "/gallery/work-19.png", alt: "Oil change on a Jeep in a driveway", from: [40, 90, 7] },
    ] },
  { title: "We bring the oil, the filter and the mess kit.", text: "Mats down, old oil taken away, nothing left on your driveway.",
    photos: [
      { src: "/gallery/work-07.webp", alt: "Oil change on a blue Ford pickup", from: [-40, 80, 6] },
      { src: "/gallery/work-22.png", alt: "Oil change on a Volkswagen in a driveway", from: [40, 60, -6] },
    ] },
  { title: "You keep your day. We do the oil change.", cta: true,
    photos: [{ src: "/gallery/work-15.png", alt: "Oil change on a Honda in a driveway", from: [0, 120, 0] }] },
];

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function ScrollPhotos() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-fly]"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const it of items) {
        if (still) { it.style.opacity = "1"; it.style.transform = "none"; continue; }
        const [fx, fy, rot, tilt] = (it.dataset.fly || "0,0,0,0").split(",").map(Number);
        const top = it.getBoundingClientRect().top;
        // starts as the photo's top edge comes up from the bottom of the screen, done by the time it's 45% up
        const t = ease(clamp((vh - top) / (vh * 0.55)));
        it.style.opacity = String(Math.min(1, t * 1.4));
        it.style.transform = `translate(${fx * (1 - t)}vw, ${fy * (1 - t)}px) rotate(${rot * (1 - t) + tilt}deg) scale(${0.85 + 0.15 * t})`;
      }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={root} aria-label="Real jobs" className="text-white overflow-hidden" style={{ background: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 flex flex-col gap-16 sm:gap-24">
        {BLOCKS.map((b, bi) => {
          const pair = b.photos.length > 1;
          return (
            <div key={b.title} className={`grid gap-8 items-center ${pair ? "md:grid-cols-[2fr_3fr]" : "md:grid-cols-[3fr_2fr]"}`}>
              <div className={`flex flex-col gap-3 ${pair ? "" : "md:order-2"}`}>
                {b.kicker && <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>{b.kicker}</p>}
                <h2 className="text-[36px] sm:text-[52px] leading-[0.95] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{b.title}</h2>
                {b.text && <p className="text-[18px] text-white/85">{b.text}</p>}
                {b.cta && <div className="pt-2"><Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>Get my price</Link></div>}
              </div>
              <div className={pair ? "grid grid-cols-2 gap-3 sm:gap-5" : ""}>
                {b.photos.map((ph, i) => (
                  <div key={ph.src} data-fly={`${ph.from.join(",")},${pair ? (i ? 2 : -2) : 0}`}
                    className={`relative rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/90 will-change-transform ${pair ? `aspect-[3/4] ${i ? "mt-10" : ""}` : "aspect-[4/3]"}`}
                    style={{ opacity: 0 }}>
                    <Image src={ph.src} alt={ph.alt} fill sizes={pair ? "(min-width: 768px) 330px, 50vw" : "(min-width: 768px) 660px, 100vw"} className="object-cover" priority={bi === 0} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

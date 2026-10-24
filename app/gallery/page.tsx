// Real job photos.
import Image from "next/image";
import Link from "next/link";
import { NAVY, GOLD } from "@/components/site/brand";

export const metadata = { title: "Gallery", description: "Real photos from our mobile oil changes in driveways, parking lots and garages around HRM." };

const PHOTOS = ["work-01.webp", "work-02.webp", "work-03.webp", "work-05.webp", "work-06.webp", "work-07.webp", "work-08.webp", "work-09.JPG",
  "work-11.png", "work-12.png", "work-13.png", "work-14.png", "work-15.png", "work-16.png", "work-17.png", "work-18.png", "work-19.png",
  "work-20.png", "work-21.png", "work-22.png"];

export default function Gallery() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3">
          <h1 className="text-[44px] sm:text-[56px] leading-[0.95] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Real jobs, not stock photos</h1>
          <p className="text-[18px] text-white/85">Driveways, parking lots and garages around HRM.</p>
        </div>
      </section>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-8">
        <div className="columns-2 md:columns-3 gap-3 [&>*]:mb-3">
          {PHOTOS.map((f, i) => (
            <div key={f} className="relative w-full overflow-hidden rounded-xl break-inside-avoid">
              <Image src={`/gallery/${f}`} alt={`Oil Change On The Spot job photo ${i + 1}`} width={800} height={1000}
                sizes="(min-width: 768px) 33vw, 50vw" className="w-full h-auto" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: GOLD }}>
          <p className="text-[28px] font-extrabold leading-none" style={{ fontFamily: "var(--font-condensed)" }}>Your driveway next?</p>
          <Link href="/booking" className="inline-block rounded-xl px-6 py-4 text-[18px] font-extrabold text-white no-underline" style={{ background: NAVY }}>Get my price</Link>
        </div>
      </div>
    </div>
  );
}

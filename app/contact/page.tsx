import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import { PHONE, PHONE_TEL, EMAIL, NAVY, GOLD } from "@/components/site/brand";

export const metadata = { title: "Contact", description: "Call, text or email Oil Change On The Spot, or book online any time." };

const SOCIALS: [string, string][] = [["Instagram", "https://www.instagram.com/oilchangeonthespot"], ["Facebook", "https://www.facebook.com/share/1ErPmq1186/?mibextid=wwXlfr"],
  ["TikTok", "https://www.tiktok.com/@oilchangeonthespot"], ["Google Maps", "https://google.com/maps?cid=877823960605999310"]];

export default function Contact() {
  return (
    <PageShell title="Get in touch" intro={<>The fastest way to book is online: you see your price and pick a time right away. <Link href="/booking" className="font-bold underline" style={{ color: GOLD }}>Book now</Link></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: "#eef1f6" }}>
          <h2>Call or text</h2>
          <a href={PHONE_TEL} className="text-[24px] font-extrabold" style={{ color: NAVY }}>{PHONE}</a>
          <p>Texting is best while we&apos;re on a job.</p>
        </div>
        <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: "#eef1f6" }}>
          <h2>Email</h2>
          <a href={`mailto:${EMAIL}`} className="font-bold break-all" style={{ color: NAVY }}>{EMAIL}</a>
          <p>For fleets, invoices and anything that isn&apos;t urgent.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h2>Where we go</h2>
        <p>All of HRM. Travel is free within 30 km of Dartmouth, and the fee for further out shows in your price before you book.</p>
      </div>
      <div className="flex flex-col gap-2">
        <h2>Follow our work</h2>
        <div className="flex flex-wrap gap-2">
          {SOCIALS.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer" className="rounded-full px-4 py-2 font-bold border-2 no-underline" style={{ borderColor: NAVY, color: NAVY }}>{n}</a>)}
        </div>
      </div>
    </PageShell>
  );
}

import Link from "next/link";
import PageShell from "@/components/site/PageShell";
import { NAVY, GOLD } from "@/components/site/brand";

export default function NotFound() {
  return (
    <PageShell title="Page not found" intro="That page doesn't exist anymore. Here's where you probably wanted to go.">
      <div className="flex flex-wrap gap-3">
        <Link href="/booking" className="rounded-xl px-6 py-4 text-[18px] font-extrabold no-underline" style={{ background: GOLD, color: NAVY }}>Get my price</Link>
        <Link href="/" className="rounded-xl px-6 py-4 text-[18px] font-bold border-2 no-underline" style={{ borderColor: NAVY, color: NAVY }}>Home page</Link>
      </div>
    </PageShell>
  );
}

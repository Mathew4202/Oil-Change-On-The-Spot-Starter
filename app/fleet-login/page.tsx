// Fleet login: enter the mobile or email on the account, get the private link by text. No password to remember.
import FleetLogin from "./FleetLogin";
import { NAVY, GOLD } from "@/components/site/brand";

export const metadata = { title: "Fleet login", description: "Fleet customers: see your vehicles, book a yard visit and view invoices." };

export default function Page() {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-2">
          <p className="font-bold tracking-[0.12em] text-sm" style={{ color: GOLD }}>FLEET ACCOUNTS</p>
          <h1 className="text-[40px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Fleet login</h1>
          <p className="text-white/85 text-[17px]">Your vehicles, what&apos;s due, booking a yard visit and your invoices, in one place.</p>
        </div>
      </section>
      <FleetLogin />
    </div>
  );
}

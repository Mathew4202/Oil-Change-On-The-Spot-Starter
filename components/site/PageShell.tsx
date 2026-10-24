// Simple page layout for text pages (Contact, Terms, Privacy) in the website style.
import { NAVY } from "./brand";
export default function PageShell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-[#0d1b3e]">
      <section className="text-white" style={{ background: NAVY }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 flex flex-col gap-3">
          <h1 className="text-[44px] sm:text-[54px] leading-[0.95] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{title}</h1>
          {intro && <div className="text-[18px] text-white/85 leading-relaxed">{intro}</div>}
        </div>
      </section>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6 text-[16px] leading-relaxed [&_h2]:text-[24px] [&_h2]:font-bold [&_h2]:text-[#0d1b3e] [&_p]:text-[#4a5878] [&_li]:text-[#4a5878]">{children}</div>
    </div>
  );
}

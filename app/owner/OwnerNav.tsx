"use client";
// Bottom menu for OCOTS HQ.
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const NAVY = "#0d1b3e", GOLD = "#f2b01e";
const ICONS: Record<string, JSX.Element> = {
  Calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  Customers: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6" /></>,
  Receipt: <><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="4" /></>,
  Stock: <><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /></>,
  Money: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
};
const ITEMS: { label: string; href: string | null }[] = [
  { label: "Calendar", href: "/owner" }, { label: "Customers", href: null }, { label: "Receipt", href: "/owner/receipt" },
  { label: "Stock", href: "/owner/stock" }, { label: "Money", href: null },
];

export default function OwnerNav() {
  const path = usePathname();
  return (
    <nav aria-label="App sections" className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-[#dde3ee] pb-[max(14px,env(safe-area-inset-bottom))] pt-2">
      <div className="max-w-xl mx-auto grid grid-cols-5 gap-1 px-2">
        {ITEMS.map(({ label, href }) => {
          const active = href === "/owner" ? path === "/owner" : !!href && path?.startsWith(href);
          const inner = (
            <>
              <span className="w-10 h-7 rounded-full flex items-center justify-center" style={{ background: active ? GOLD : "transparent" }}>
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[label]}</svg>
              </span>
              {label}{!href && <span className="sr-only"> (coming soon)</span>}
            </>
          );
          const cls = "flex flex-col items-center gap-0.5 py-1 text-[12px]";
          const style = { color: active ? NAVY : href ? "#4a5878" : "#b5bfd3", fontWeight: active ? 800 : 600 };
          return href
            ? <Link key={label} href={href as Route} className={cls} style={style} aria-current={active ? "page" : undefined}>{inner}</Link>
            : <span key={label} className={cls} style={style}>{inner}</span>;
        })}
      </div>
    </nav>
  );
}

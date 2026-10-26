import { Barlow, Barlow_Condensed } from "next/font/google";
import { currentStaff } from "@/lib/os/auth";
import { RoleProvider } from "./RoleContext";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-condensed" });

export const metadata = {
  title: "OCOTS HQ",
  manifest: "/owner/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "OCOTS HQ", statusBarStyle: "black-translucent" },
};
export const viewport = { themeColor: "#0d1b3e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const s = currentStaff();
  return (
    <div className={`${barlow.variable} ${condensed.variable} ocots-owner`} style={{ fontFamily: "var(--font-barlow), system-ui, sans-serif" }}>
      <RoleProvider name={s?.name ?? null} role={s?.role ?? "owner"}>{children}</RoleProvider>
    </div>
  );
}

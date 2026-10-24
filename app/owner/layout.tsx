import { Barlow, Barlow_Condensed } from "next/font/google";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-condensed" });

export const metadata = {
  title: "OCOTS Calendar",
  manifest: "/owner/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "OCOTS", statusBarStyle: "black-translucent" },
};
export const viewport = { themeColor: "#0d1b3e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${barlow.variable} ${condensed.variable} ocots-owner`} style={{ fontFamily: "var(--font-barlow), system-ui, sans-serif" }}>{children}</div>;
}

import { Barlow, Barlow_Condensed } from "next/font/google";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-condensed" });

export const metadata = {
  title: "Book an oil change",
  description: "See your exact price and book a time. We come to you anywhere in HRM.",
};
export const viewport = { themeColor: "#0d1b3e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${barlow.variable} ${condensed.variable}`} style={{ fontFamily: "var(--font-barlow), system-ui, sans-serif" }}>{children}</div>;
}

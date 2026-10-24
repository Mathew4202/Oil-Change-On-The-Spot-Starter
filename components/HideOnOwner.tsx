"use client";
// Hides the public website's menu, footer and sticky buttons inside the owner app.
import { usePathname } from "next/navigation";
export default function HideOnOwner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path?.startsWith("/owner") || path?.startsWith("/booking") || path?.startsWith("/b/")) return null;   // app-style screens have their own header
  return <>{children}</>;
}

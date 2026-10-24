// Google Analytics 4 "generate_lead" event. Google Ads counts it as the main conversion (Phase 3 setup),
// so every finished booking or request on the new site has to send it.
export function trackLead(source: string, extra: Record<string, string | number> = {}) {
  try {
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof g === "function") g("event", "generate_lead", { lead_source: source, ...extra });
  } catch { /* never block a booking over analytics */ }
}

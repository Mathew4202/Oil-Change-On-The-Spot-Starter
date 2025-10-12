// lib/analytics.ts
export function track(event: string, props?: Record<string, any>) {
  try {
    if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
      window.plausible(event, props ? { props } : undefined);
    }
  } catch {
    // no-op in case analytics is blocked
  }
}

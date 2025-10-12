// types/plausible.d.ts
declare global {
    interface Window {
      // Plausible snippet injects this at runtime
      plausible?: (event: string, options?: { props?: Record<string, any> }) => void;
    }
  }
  export {};
  
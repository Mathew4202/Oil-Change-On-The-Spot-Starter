"use client";
// When a tap makes several buttons wait at once (they share one "busy" flag), only the one you tapped should look busy.
// While it waits, buttons that were working before the tap keep their normal look (see globals.css).
import { useEffect } from "react";

export default function PressedMark() {
  useEffect(() => {
    const root = document.documentElement;
    let poll: ReturnType<typeof setInterval> | undefined;
    const clear = () => {
      clearInterval(poll); root.removeAttribute("data-pressing");
      document.querySelectorAll("[data-pressed],[data-was-off]").forEach((el) => { el.removeAttribute("data-pressed"); el.removeAttribute("data-was-off"); });
    };
    const on = (e: Event) => {
      const b = (e.target as HTMLElement | null)?.closest?.("button");
      if (!b || b.disabled) return;
      clear();
      document.querySelectorAll<HTMLButtonElement>(".ocots-owner button:disabled").forEach((x) => x.setAttribute("data-was-off", ""));   // already off before the tap: leave them looking off
      b.setAttribute("data-pressed", ""); root.setAttribute("data-pressing", "");
      const started = Date.now(); let wentBusy = false;
      poll = setInterval(() => {
        if (b.disabled) wentBusy = true;
        if (!b.isConnected || (wentBusy && !b.disabled) || Date.now() - started > (wentBusy ? 30000 : 600)) clear();
      }, 150);
    };
    document.addEventListener("click", on, true);
    return () => { document.removeEventListener("click", on, true); clear(); };
  }, []);
  return null;
}

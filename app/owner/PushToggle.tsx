"use client";
// Turn phone notifications on/off for this phone, with plain instructions when the phone needs a step first.
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "ios-home" | "blocked" | "off" | "on" | "working";
const NAVY = "#0d1b3e", GOLD = "#f2b01e";

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  return navigator.serviceWorker.register("/owner-sw.js", { scope: "/owner" });
}

export function usePushState() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-home" : "unsupported"); return;
      }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      try {
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch { setState("off"); }
    })();
  }, []);

  async function turnOn() {
    setState("working"); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/owner/push")).json();
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) }));
      const r = await fetch("/api/owner/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) });
      if (!r.ok) throw new Error("save failed");
      setState("on"); setMsg("Done. You should get a test notification in a few seconds.");
    } catch {
      setState("off"); setMsg("Couldn't turn them on. Try again, or check your phone's notification settings.");
    }
  }

  async function sendTest() {
    const reg = await registration(); const sub = await reg.pushManager.getSubscription(); if (!sub) return setState("off");
    await fetch("/api/owner/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) });
    setMsg("Test sent.");
  }

  async function turnOff() {
    const reg = await registration(); const sub = await reg.pushManager.getSubscription();
    if (sub) { await fetch("/api/owner/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off"); setMsg("");
  }
  return { state, msg, turnOn, sendTest, turnOff };
}

export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const { state, msg, turnOn, sendTest, turnOff } = usePushState();
  if (compact && (state === "on" || state === "loading" || state === "unsupported")) return null;

  const box = "rounded-xl p-3 flex flex-col gap-2 text-[15px]";
  return (
    <div className={box} style={{ background: state === "on" ? "#dff3e6" : "#fff6dd", border: `1px solid ${state === "on" ? "#9fd3b2" : GOLD}` }}>
      {state === "loading" && <p>Checking notifications…</p>}
      {state === "unsupported" && <p>This browser can&apos;t show notifications. Open OCOTS HQ in Safari (iPhone) or Chrome (Android).</p>}
      {state === "ios-home" && (
        <p><strong>Get a buzz for new bookings:</strong> on iPhone, tap Share → <strong>Add to Home Screen</strong>, open OCOTS HQ from your home screen, then turn notifications on here.</p>
      )}
      {state === "blocked" && <p><strong>Notifications are blocked.</strong> Turn them on in your phone&apos;s Settings → Notifications → OCOTS HQ (or your browser), then come back.</p>}
      {(state === "off" || state === "working") && (
        <>
          <p><strong>Get a buzz for every new booking</strong> on this phone.</p>
          <button onClick={turnOn} disabled={state === "working"} className="h-11 rounded-lg font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
            {state === "working" ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="font-semibold text-[#1d6b3a]">Notifications are on for this phone.</p>
          <div className="flex gap-2">
            <button onClick={sendTest} className="h-10 px-3 rounded-lg border border-[#9fd3b2] bg-white font-bold text-sm">Send a test</button>
            <button onClick={turnOff} className="h-10 px-3 rounded-lg border border-[#9fd3b2] bg-white font-bold text-sm">Turn off</button>
          </div>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

"use client";
// A one-minute walkthrough of HQ: the screen dims and each step lights up one button with a short note.
// It runs by itself the first time someone signs in on a phone, and again any time from the "?" at the top.
// Steps only show for buttons that login actually has, so Teagan's tour is different from a technician's.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useRole } from "./RoleContext";
import { ROLE_INFO, isRole } from "@/lib/os/roles";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", MUTED = "#4a5878";
type Step = { target?: string; title: string; text: string };

const STEPS: Step[] = [
  { title: "Welcome", text: "" },
  { target: "week", title: "Pick a day", text: "Tap a day to see its jobs. Arrows move a week at a time." },
  { target: "alerts", title: "Alerts", text: "New bookings, changes, cancellations and customer replies land here. The number is what you haven't looked at yet." },
  { target: "calls", title: "Calls and texts to follow up", text: "Calls and texts we didn't get to. Text them the booking link (their details are already filled in), hold a time for them, or send a quick reply. Texts you send are signed with your name." },
  { target: "new-booking", title: "New booking", text: "For someone on the phone. Pick their car and the service, and it shows the price and the open times." },
  { target: "job-buttons", title: "Each job", text: "Directions to the customer, or call or text them in one tap." },
  { target: "start-job", title: "Start job", text: "Tap this when you get there. You'll snap the odometer and VIN, then finish and take payment. The customer gets their receipt and a thank-you text signed with your name." },
  { target: "route", title: "The day's route", text: "Opens the whole day in Google Maps, stop after stop." },
  { target: "nav-customers", title: "Customers", text: "Everyone we've done, with their cars and history. You can send someone their referral link from here." },
  { target: "nav-receipt", title: "Receipts", text: "Snap every parts, oil or gas receipt here. It keeps the books right and gets HST back." },
  { target: "nav-stock", title: "Stock", text: "Oil and filters on hand. It goes down by itself as jobs are finished." },
  { target: "nav-money", title: "Money", text: "Profit, HST to set aside, the bank statement, and money per hour by area." },
  { title: "That's it", text: "Tap the ? at the top of the calendar any time to see this again." },
];

const key = (name: string) => `ocots_tour_${name}`;
const seen = (name: string) => { try { return !!localStorage.getItem(key(name)); } catch { return true; } };
const markSeen = (name: string) => { try { localStorage.setItem(key(name), "1"); } catch { /* private mode: fine */ } };

export default function Tour({ ready }: { ready: boolean }) {
  const { name, role } = useRole();
  const me = name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);

  const start = useCallback(() => {
    // only the steps whose button is on this screen for this login
    setSteps(STEPS.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`)));
    setI(0);
  }, []);
  const close = useCallback(() => { setSteps(null); if (name) markSeen(name); }, [name]);

  useEffect(() => {
    const go = () => start();
    window.addEventListener("ocots-tour", go);
    return () => window.removeEventListener("ocots-tour", go);
  }, [start]);
  useEffect(() => {   // first time on this phone: start by itself once the day has loaded
    if (!ready || !name || seen(name)) return;
    const t = setTimeout(start, 800);
    return () => clearTimeout(t);
  }, [ready, name, start]);

  const step = steps?.[i];
  const measure = useCallback(() => {
    const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    setBox(el ? el.getBoundingClientRect() : null);
  }, [step]);
  useLayoutEffect(() => {
    const el = step?.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    if (el && !step?.target?.startsWith("nav-")) el.scrollIntoView({ block: "center" });
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step, measure]);
  useEffect(() => {
    if (!steps) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [steps, close]);

  if (!steps || !step) return null;
  const last = i === steps.length - 1;
  const roleName = isRole(role) ? ROLE_INFO[role].name : "";
  const text = i === 0
    ? `Hi${me ? ` ${me}` : ""}! This is HQ, where we run the day. Here's a one-minute look around.${role !== "owner" && roleName ? ` Your login is set up for ${roleName.toLowerCase()}, so you only see what you need.` : ""}`
    : step.text;
  const pad = 6;
  const below = box ? box.bottom + 190 < window.innerHeight : true;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Walkthrough: ${step.title}`}>
      {box ? (
        <div className="fixed rounded-xl pointer-events-none transition-all duration-200"
          style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 9999px rgba(8,14,32,.62)", outline: `3px solid ${GOLD}` }} />
      ) : <div className="fixed inset-0" style={{ background: "rgba(8,14,32,.62)" }} />}
      <div className="fixed left-4 right-4 mx-auto max-w-md bg-white rounded-2xl p-4 shadow-xl flex flex-col gap-2"
        style={box ? (below ? { top: Math.min(box.bottom + 14, window.innerHeight - 200) } : { bottom: Math.max(window.innerHeight - box.top + 14, 16) }) : { top: "30%" }}>
        <p className="text-xs font-bold" style={{ color: MUTED }}>{i + 1} of {steps.length}</p>
        <h2 className="font-extrabold text-lg" style={{ color: NAVY }}>{step.title}</h2>
        <p className="text-[15px] leading-snug" style={{ color: NAVY }}>{text}</p>
        <div className="flex gap-2 mt-1">
          {!last && <button onClick={close} className="h-11 px-4 rounded-xl border font-bold" style={{ borderColor: "#c8d0e0", color: NAVY }}>Skip</button>}
          {i > 0 && <button onClick={() => setI(i - 1)} className="h-11 px-4 rounded-xl border font-bold" style={{ borderColor: "#c8d0e0", color: NAVY }}>Back</button>}
          <button onClick={() => (last ? close() : setI(i + 1))} autoFocus className="h-11 flex-1 rounded-xl font-extrabold" style={{ background: GOLD, color: NAVY }}>{last ? "Got it" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

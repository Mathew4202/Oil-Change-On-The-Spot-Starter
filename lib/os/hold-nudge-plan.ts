// When to remind someone we held a time for who hasn't finished booking through the link.
// Pure (tested in __tests__/hold-nudge.test.ts): 30 minutes after the hold, then 1 hour after.

export type NudgeHold = { status: string; booking_id: string | null; starts_at: string; expires_at: string; created_at: string };

const MIN = 60000;

/** Which reminder is due now (1 = 30 min, 2 = 1 hour), or null. sent = reminders already sent for this hold. */
export function dueNudge(h: NudgeHold, now: Date, sent: number[], halifaxHour: number): 1 | 2 | null {
  if (h.status !== "held" || h.booking_id) return null;
  const t = now.getTime();
  if (new Date(h.expires_at).getTime() <= t) return null;            // the hold ran out: the time is open again
  if (new Date(h.starts_at).getTime() - t < 20 * MIN) return null;     // too close to the appointment to chase
  const age = t - new Date(h.created_at).getTime();
  if (age > 3 * 60 * MIN) return null;                                // an old hold: don't text out of nowhere
  if (halifaxHour < 8 || halifaxHour >= 21) return null;              // no texts at night
  const n = age >= 60 * MIN ? 2 : age >= 30 * MIN ? 1 : null;
  if (!n || sent.includes(n)) return null;
  return n;
}

const SERVICE: Record<string, string> = { oil_change: "oil change", seasonal: "seasonal package", tires: "tire change", rotation: "tire rotation", parts: "parts install", diagnostic: "diagnostic" };
export const serviceName = (job: string) => SERVICE[job] ?? "appointment";
export const whyDetails = (job: string) => (job === "oil_change" || job === "seasonal" ? "to grab the right filter" : "to get everything ready");

export const NUDGE_DEFAULTS: Record<1 | 2, string> = {
  1: "Hey {first_name}! Just checking in on your {service} for {time}. The booking hasn't come through on our end yet, and we need your details {why}. You can fill out the link here: {link}\nOr just text me your car's year, make and model plus your address here and I'll book it for you.\n- {signer}, Oil Change On The Spot",
  2: "Hi {first_name}, just following up on your {service} for {time}. I'm still holding the time for you until {until}. You can fill out the link here: {link}\nOr text me your car's year, make and model plus your address and I'll book it for you.\n- {signer}, Oil Change On The Spot",
};

/** "1:00 pm" today, "tomorrow at 1:00 pm", otherwise "Thu, Nov 5 at 1:00 pm". days = Halifax dates (YYYY-MM-DD). */
export function timeWords(apptDay: string, today: string, clock: string, full: string) {
  if (apptDay === today) return clock;
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return apptDay === d.toISOString().slice(0, 10) ? `tomorrow at ${clock}` : full;
}

/** The "see you in 2 hours" text: due 2 hours before (sent between 75 and 125 minutes out), daytime only,
 *  and not for a booking made in the last 3 hours (they just got the confirmation). */
export function soonDue(b: { starts_at: string; created_at: string; status: string }, now: Date, halifaxHour: number) {
  if (b.status !== "confirmed" && b.status !== "requested") return false;
  const mins = (new Date(b.starts_at).getTime() - now.getTime()) / 60000;
  if (mins < 75 || mins > 125) return false;
  if (now.getTime() - new Date(b.created_at).getTime() < 3 * 3600000) return false;
  return halifaxHour >= 8 && halifaxHour < 20;
}

export const SOON_DEFAULT = "Hi {first_name}, see you today at {time} at {address} for your {service}. Please make sure the car is parked where we can get to it. Need to change something? Just reply here.\n- {signer}, Oil Change On The Spot";

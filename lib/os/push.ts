// Phone notifications for OCOTS HQ (standard web push, free).
// The signing keys are made once automatically and kept in the database, so there is nothing to set up in Vercel.
import webpush from "web-push";
import { sbGet, sbInsert, sbHeaders, enc } from "@/lib/os/db";

type Vapid = { publicKey: string; privateKey: string };
let cached: Vapid | null = null;
const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const [row] = await sbGet<{ value: Vapid }>("app_secrets?select=value&key=eq.vapid");
  if (row?.value?.publicKey) return (cached = row.value);
  const fresh = webpush.generateVAPIDKeys();
  await sbInsert("app_secrets", { key: "vapid", value: fresh });   // if two requests race, the first one wins
  const [saved] = await sbGet<{ value: Vapid }>("app_secrets?select=value&key=eq.vapid");
  return (cached = saved?.value ?? fresh);
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Send to every signed-up phone (or just one owner's). Never throws: a failed push must not break a booking. */
export async function pushToOwners(msg: PushMessage, onlyOwner?: string): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  try {
    const keys = await vapidKeys();
    webpush.setVapidDetails(process.env.PUSH_CONTACT || "mailto:oilchangeonthespot@gmail.com", keys.publicKey, keys.privateKey);
    const subs = await sbGet<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      `push_subscriptions?select=id,endpoint,p256dh,auth${onlyOwner ? `&owner=eq.${enc(onlyOwner)}` : ""}`);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: "high" });
        sent++;
        await fetch(`${base()}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "PATCH",
          headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ last_ok: new Date().toISOString() }) });
      } catch (e: unknown) {
        failed++;
        const code = (e as { statusCode?: number })?.statusCode;
        console.error(`push to ${s.endpoint.slice(0, 40)}… failed`, code ?? (e as Error)?.message);
        if (code === 404 || code === 410) {   // phone unsubscribed or app removed: forget it
          await fetch(`${base()}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers: sbHeaders() });
        }
      }
    }));
  } catch (e) { console.error("push failed", e); }
  return { sent, failed };
}

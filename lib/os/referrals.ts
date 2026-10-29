// Refer a friend, $5 off: all automatic.
//  1) Every customer has a link (/r/CODE). It's on their receipt; HQ can copy or text it.
//  2) A friend books with it (or types who sent them, or HQ picks "Referred by"): the friend is tied to them.
//  3) When the friend's first visit is finished, the referrer gets a $5 credit and a text.
//  4) The credit comes off the referrer's next booking by itself. A cancelled booking gives it back.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { makeRefCode, pickCredits } from "@/lib/os/deals";
import { siteUrl, textCustomer } from "@/lib/os/customer-texts";

export const refLink = (code: string) => `${siteUrl()}/r/${code}`;

/** Their code, made the first time it's needed. null before migration 0033. */
export async function ensureRefCode(customerId: string): Promise<string | null> {
  const [c] = await sbGet<{ first_name: string | null; ref_code: string | null }>(`customers?select=first_name,ref_code&id=eq.${enc(customerId)}`).catch(() => []);
  if (!c) return null;
  if (c.ref_code) return c.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = makeRefCode(c.first_name);
    if (await sbPatch("customers", `id=eq.${enc(customerId)}&ref_code=is.null`, { ref_code: code }).catch(() => false)) {
      const [x] = await sbGet<{ ref_code: string | null }>(`customers?select=ref_code&id=eq.${enc(customerId)}`);
      if (x?.ref_code) return x.ref_code;
    }
  }
  return null;
}

export async function customerByRef(code: string) {
  const c = String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  if (c.length < 4) return null;
  const [x] = await sbGet<{ id: string; first_name: string | null }>(`customers?select=id,first_name&ref_code=eq.${enc(c)}`).catch(() => []);
  return x ?? null;
}

/** Who sent them: a referral code from their link, or what they typed ("Sarah, 902 555 1234"). A phone number has to match. */
export async function findReferrer(input: { code?: string | null; text?: string | null }) {
  if (input.code) { const c = await customerByRef(input.code); if (c) return c.id; }
  const digits = String(input.text || "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(`+1${digits.slice(-10)}`)}`).catch(() => []);
    if (c) return c.id;
  }
  return null;
}

/** Tie a new customer to whoever sent them (only before their first visit, never to themselves). */
export async function setReferredBy(customerId: string, referrerId: string | null) {
  if (!referrerId || referrerId === customerId) return false;
  const [done] = await sbGet<{ id: string }>(`jobs?select=id&customer_id=eq.${enc(customerId)}&service=neq.cancellation_fee&limit=1`).catch(() => [{ id: "x" }]);
  if (done) return false;
  return sbPatch("customers", `id=eq.${enc(customerId)}&referred_by=is.null`, { referred_by: referrerId }).catch(() => false);
}

export async function openCredits(customerId: string) {
  return sbGet<{ id: string; amount: number; reason: string; note: string | null; created_at: string }>(
    `customer_credits?select=id,amount,reason,note,created_at&customer_id=eq.${enc(customerId)}&used_at=is.null&order=created_at`).catch(() => []);
}

/** Use their credits on this booking (called while booking). Returns the lines to add. */
export async function takeCredits(customerId: string, subtotal: number) {
  const open = await openCredits(customerId);
  const { used, total } = pickCredits(open.map((c) => ({ id: c.id, amount: Number(c.amount) })), subtotal);
  return { ids: used.map((u) => u.id), total, lines: total ? [{ label: used.length > 1 ? `Referral credits (${used.length})` : "Referral credit", amount: -total }] : [] };
}
export async function markCreditsUsed(ids: string[], bookingId: string) {
  if (!ids.length) return;
  await sbPatch("customer_credits", `id=in.(${ids.join(",")})&used_at=is.null`, { used_booking_id: bookingId, used_at: new Date().toISOString() }).catch(() => null);
}
/** Booking cancelled: its credits go back on their account. */
export async function releaseCredits(bookingId: string) {
  await sbPatch("customer_credits", `used_booking_id=eq.${enc(bookingId)}`, { used_booking_id: null, used_at: null }).catch(() => null);
}

/** A job was finished. If it's this customer's first visit and someone referred them, that person gets their credit (once). */
export async function rewardReferrer(customerId: string) {
  const [c] = await sbGet<{ id: string; first_name: string | null; referred_by: string | null }>(`customers?select=id,first_name,referred_by&id=eq.${enc(customerId)}`).catch(() => []);
  if (!c?.referred_by) return null;
  const jobs = await sbGet<{ id: string }>(`jobs?select=id&customer_id=eq.${enc(customerId)}&service=neq.cancellation_fee&limit=2`).catch(() => []);
  if (jobs.length !== 1) return null;   // only on the first visit
  const [rule] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.referral_credit").catch(() => []);
  const amount = Number(rule?.value ?? 5);
  const r = await sbInsert<{ id: string }>("customer_credits", { customer_id: c.referred_by, amount, reason: "referral", referred_customer_id: c.id, note: `Referred ${c.first_name || "a friend"}`, created_by: "auto" });
  if (!r.ok) return null;   // already given for this friend
  const [ref] = await sbGet<{ id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null }>(`customers?select=id,first_name,phone,sms_opt_out&id=eq.${c.referred_by}`);
  if (ref) await textCustomer("referral_credit", ref, { friend: c.first_name?.trim() || "a friend", amount: amount.toFixed(amount % 1 ? 2 : 0), link: `${siteUrl()}/booking` }).catch(() => null);
  return r.data?.id ?? null;
}

/** HQ: give a credit by hand (a referral from before, a goodwill credit). */
export async function giveCredit(customerId: string, amount: number, note: string, by: string) {
  if (!(amount > 0 && amount <= 200)) return { ok: false as const, error: "Pick an amount between $1 and $200" };
  const r = await sbInsert("customer_credits", { customer_id: customerId, amount: Math.round(amount * 100) / 100, reason: "manual", note: note.slice(0, 120) || null, created_by: by });
  return r.ok ? { ok: true as const } : { ok: false as const, error: "Couldn't save it (run migration 0033 first)" };
}
/** HQ: take back a credit that hasn't been used (marked used, with no booking). */
export async function removeCredit(id: string) {
  return sbPatch("customer_credits", `id=eq.${enc(id)}&used_at=is.null`, { used_at: new Date().toISOString(), note: "Removed in HQ" }).catch(() => false);
}

/** For the customer's HQ page: their link, who sent them, who they sent, and their credits. */
export async function referralInfo(customerId: string) {
  const code = await ensureRefCode(customerId);
  const [c] = await sbGet<{ referred_by: string | null }>(`customers?select=referred_by&id=eq.${enc(customerId)}`).catch(() => []);
  const [by] = c?.referred_by ? await sbGet<{ id: string; first_name: string | null; last_name: string | null }>(`customers?select=id,first_name,last_name&id=eq.${c.referred_by}`) : [];
  const sent = await sbGet<{ id: string; first_name: string | null; last_name: string | null }>(`customers?select=id,first_name,last_name&referred_by=eq.${enc(customerId)}`).catch(() => []);
  const credits = await sbGet<{ id: string; amount: number; reason: string; note: string | null; created_at: string; used_booking_id: string | null; used_at: string | null }>(
    `customer_credits?select=id,amount,reason,note,created_at,used_booking_id,used_at&customer_id=eq.${enc(customerId)}&order=created_at.desc&limit=20`).catch(() => []);
  const name = (x: { first_name: string | null; last_name: string | null }) => [x.first_name, x.last_name].filter(Boolean).join(" ") || "Customer";
  return {
    code, link: code ? refLink(code) : null,
    referredBy: by ? { id: by.id, name: name(by) } : null,
    sent: sent.map((s) => ({ id: s.id, name: name(s) })),
    credits: credits.map((x) => ({ id: x.id, amount: Number(x.amount), why: x.note || (x.reason === "referral" ? "Referral" : "Credit"), at: x.created_at,
      used: !!x.used_at, removed: !!x.used_at && !x.used_booking_id })),
    balance: Math.round(credits.filter((x) => !x.used_at).reduce((t, x) => t + Number(x.amount), 0) * 100) / 100,
  };
}

// Elavon Converge, the card processor (through Priority Pay). Plain helpers only, no database, so tests can run them.
// Flow: we ask Converge for a one-time token for an amount → the customer types their card on Converge's own page →
// Converge sends them back to us → we ask Converge directly whether that transaction was approved, and for how much.
// We never see or store card numbers.
//
// Env (Vercel only): CONVERGE_MERCHANT_ID, CONVERGE_USER_ID, CONVERGE_PIN, CONVERGE_ENV=demo|prod (demo until it's tested).
// CONVERGE_TEST_BASE points at a fake Converge for local testing.
// NOTE: the field names follow Converge's hosted payments + txnquery docs. Run one demo payment end to end before going live.

export type ConvergeEnv = { merchantId: string; userId: string; pin: string; base: string; demo: boolean };

export function convergeEnv(env: Record<string, string | undefined> = process.env): ConvergeEnv | null {
  const merchantId = env.CONVERGE_MERCHANT_ID, userId = env.CONVERGE_USER_ID, pin = env.CONVERGE_PIN;
  if (!merchantId || !userId || !pin) return null;
  const demo = (env.CONVERGE_ENV || "demo") !== "prod";
  const base = env.CONVERGE_TEST_BASE || (demo ? "https://api.demo.convergepay.com" : "https://api.convergepay.com");
  return { merchantId, userId, pin, base, demo };
}

export const tokenUrl = (c: ConvergeEnv) => `${c.base}/hosted-payments/transaction_token`;
export const payPageUrl = (c: ConvergeEnv, token: string) => `${c.base}/hosted-payments?ssl_txn_auth_token=${encodeURIComponent(token)}`;
export const processUrl = (c: ConvergeEnv) => `${c.base}/${c.demo ? "VirtualMerchantDemo" : "VirtualMerchant"}/process.do`;

/** Converge invoice numbers are short: "OC" + the first 20 hex characters of our payment id. */
export const invoiceFor = (paymentId: string) => `OC${paymentId.replace(/-/g, "").slice(0, 20).toUpperCase()}`;

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** The form we post to get a payment token. returnUrl is where Converge sends the customer afterwards (approved or not). */
export function tokenForm(c: ConvergeEnv, p: { paymentId: string; amount: number; description: string; returnUrl: string; firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const f: Record<string, string> = {
    ssl_merchant_id: c.merchantId, ssl_user_id: c.userId, ssl_pin: c.pin,
    ssl_transaction_type: "ccsale", ssl_amount: money(p.amount), ssl_invoice_number: invoiceFor(p.paymentId),
    ssl_description: p.description.slice(0, 255),
    // send them back to us after approved or declined, with the result in the URL
    ssl_receipt_apprvl_method: "REDG", ssl_receipt_apprvl_get_url: p.returnUrl,
    ssl_receipt_decl_method: "REDG", ssl_receipt_decl_get_url: p.returnUrl,
    ssl_receipt_link_method: "REDG", ssl_receipt_link_url: p.returnUrl,
  };
  if (p.firstName) f.ssl_first_name = p.firstName.slice(0, 20);
  if (p.lastName) f.ssl_last_name = p.lastName.slice(0, 30);
  if (p.email) f.ssl_email = p.email.slice(0, 100);
  return f;
}

/** Ask Converge about one transaction (never trust what's in the return URL on its own). */
export function queryForm(c: ConvergeEnv, txnId: string) {
  return { ssl_merchant_id: c.merchantId, ssl_user_id: c.userId, ssl_pin: c.pin, ssl_transaction_type: "txnquery", ssl_txn_id: txnId,
    ssl_show_form: "false", ssl_result_format: "ASCII" };
}

/** Converge's ASCII answer: one key=value per line. */
export function parseAscii(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export type Verdict = { approved: boolean; reason: string; last4: string | null };

/** Approved only if Converge says so, for exactly our amount and our invoice number. */
export function judge(q: Record<string, string>, expect: { amount: number; invoice: string }): Verdict {
  const last4 = (q.ssl_card_number || "").replace(/\D/g, "").slice(-4) || null;
  if (q.errorCode || q.errorMessage) return { approved: false, reason: q.errorMessage || `error ${q.errorCode}`, last4 };
  if (q.ssl_result !== "0") return { approved: false, reason: q.ssl_result_message || "declined", last4 };
  if ((q.ssl_trans_status || "").toUpperCase() && /^(VOID|DECLINED|ERROR)/i.test(q.ssl_trans_status || "")) return { approved: false, reason: q.ssl_trans_status!, last4 };
  if (money(Number(q.ssl_amount)) !== money(expect.amount)) return { approved: false, reason: `amount was ${q.ssl_amount}, expected ${money(expect.amount)}`, last4 };
  if (q.ssl_invoice_number && q.ssl_invoice_number !== expect.invoice) return { approved: false, reason: "invoice number doesn't match", last4 };
  return { approved: true, reason: "approved", last4 };
}

/** What's still owed: the receipt total minus whatever was already paid (a booking paid online, say). */
export const amountDue = (total: number, paidSoFar: number) => Math.max(0, Math.round((total - paidSoFar) * 100) / 100);

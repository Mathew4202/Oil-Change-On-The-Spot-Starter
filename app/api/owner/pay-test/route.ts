// Owners: a $1.00 card test through the real Converge page. Not linked to any customer or job, nothing is recorded in HQ.
// GET → opens Converge's card page. Converge sends you back here (?back=1), and HQ asks Converge directly whether it went through.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner, isOwner } from "@/lib/os/auth";
import { convergeEnv, tokenForm, tokenUrl, payPageUrl, processUrl, queryForm, parseAscii, judge } from "@/lib/os/converge";
import { cfetch } from "@/lib/os/converge-fetch";
import { siteUrl } from "@/lib/os/customer-texts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const form = (f: Record<string, string>) => new URLSearchParams(f).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const page = (title: string, body: string, ok: boolean) => new NextResponse(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <body style="font-family:system-ui,sans-serif;background:#eef1f6;color:#0d1b3e;margin:0;padding:24px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:20px">
  <h1 style="font-size:24px;margin:0 0 8px;color:${ok ? "#1d6b3a" : "#9b1c1c"}">${esc(title)}</h1>${body}
  <p><a href="/owner/money" style="color:#0d1b3e;font-weight:700">Back to Money</a></p></div></body>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: NextRequest) {
  if (!currentOwner() || !isOwner()) return NextResponse.redirect(new URL("/owner/login", req.nextUrl.origin));
  const c = convergeEnv();
  if (!c) return page("Card payments aren't set up", "<p>Add the Converge keys in Vercel first.</p>", false);
  const q = req.nextUrl.searchParams;

  if (q.get("back")) {
    const inv = q.get("inv") || "", txn = q.get("ssl_txn_id") || "";
    if (!/^[A-Za-z0-9-]{4,64}$/.test(txn)) return page("No payment came back", "<p>Converge didn't send a transaction back (cancelled or declined). Nothing was charged.</p>", false);
    const r = await cfetch(processUrl(c), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(queryForm(c, txn)), signal: AbortSignal.timeout(15000) }).catch(() => null);
    const a = r?.ok ? parseAscii(await r.text()) : { errorMessage: "Converge didn't answer" };
    const v = judge(a, { amount: 1, invoice: inv });
    return v.approved
      ? page("The $1 test went through", `<p>Converge confirmed it: <strong>$1.00</strong>${v.last4 ? `, card ending <strong>${esc(v.last4)}</strong>` : ""}, transaction <strong>${esc(txn)}</strong>.</p>
          <p>Card payments work end to end: the card page, coming back to HQ, and HQ checking with Converge.</p>
          <p>Nothing was added to HQ. To get the $1 back, void it in the Converge portal (Transactions → find ${esc(txn)} → Void) or keep it, it's only a dollar.</p>`, true)
      : page("The test didn't go through", `<p>Converge says: ${esc(v.reason)}. Transaction ${esc(txn)}.</p>`, false);
  }

  const inv = `OCTEST${Date.now().toString(36).toUpperCase()}`;
  const f = tokenForm(c, { paymentId: "00000000-0000-4000-8000-000000000000", amount: 1, description: "Oil Change On The Spot: $1 card test (owner)", returnUrl: `${siteUrl()}/api/owner/pay-test?back=1&inv=${inv}` });
  f.ssl_invoice_number = inv;
  const r = await cfetch(tokenUrl(c), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(f), signal: AbortSignal.timeout(15000) }).catch(() => null);
  const token = r ? (await r.text()).trim() : "";
  if (!r?.ok || !token || /[<\s=]/.test(token)) return page("Converge didn't open the card page", `<p>${esc(token.replace(/<[^>]+>/g, " ").slice(0, 200) || "No answer")}</p><p>Run the Check Converge button on the Money tab.</p>`, false);
  return NextResponse.redirect(payPageUrl(c, token), 303);
}

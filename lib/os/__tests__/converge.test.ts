import { test } from "node:test";
import assert from "node:assert/strict";
import { amountDue, convergeEnv, judge, parseAscii, payPageUrl, processUrl, tokenForm } from "../converge.ts";

const env = { CONVERGE_MERCHANT_ID: "m1", CONVERGE_USER_ID: "u1", CONVERGE_PIN: "p1" };

test("not set up without all three keys", () => {
  assert.equal(convergeEnv({}), null);
  assert.equal(convergeEnv({ CONVERGE_MERCHANT_ID: "m", CONVERGE_USER_ID: "u" }), null);
});

test("demo until switched to prod", () => {
  const d = convergeEnv(env)!;
  assert.equal(d.demo, true);
  assert.match(processUrl(d), /api\.demo\.convergepay\.com\/VirtualMerchantDemo\/process\.do$/);
  const p = convergeEnv({ ...env, CONVERGE_ENV: "prod" })!;
  assert.equal(processUrl(p), "https://api.convergepay.com/VirtualMerchant/process.do");
  assert.equal(payPageUrl(p, "a b"), "https://api.convergepay.com/hosted-payments?ssl_txn_auth_token=a%20b");
});

test("token form has the amount to the cent and our invoice number", () => {
  const f = tokenForm(convergeEnv(env)!, { paymentId: "1234abcd-0000-1111-2222-333344445555", amount: 102.6, description: "x", returnUrl: "https://a/r?p=1" });
  assert.equal(f.ssl_amount, "102.60");
  assert.equal(f.ssl_transaction_type, "ccsale");
  assert.equal(f.ssl_invoice_number, "OC1234ABCD000011112222");
  assert.ok(f.ssl_invoice_number.length <= 25);
  assert.equal(f.ssl_receipt_apprvl_get_url, "https://a/r?p=1");
});

test("parse ascii answer", () => {
  assert.deepEqual(parseAscii("ssl_result=0\r\nssl_amount=10.00\nssl_result_message=APPROVAL\n"), { ssl_result: "0", ssl_amount: "10.00", ssl_result_message: "APPROVAL" });
});

test("approved only when Converge says so, for our amount and invoice", () => {
  const inv = "OCABC", ex = { amount: 102.6, invoice: inv };
  assert.equal(judge({ ssl_result: "0", ssl_amount: "102.60", ssl_invoice_number: inv }, ex).approved, true);
  assert.equal(judge({ ssl_result: "0", ssl_amount: "102.60", ssl_card_number: "41**********9990" }, ex).last4, "9990");
  assert.equal(judge({ ssl_result: "1", ssl_amount: "102.60", ssl_result_message: "DECLINED" }, ex).approved, false);
  assert.equal(judge({ ssl_result: "0", ssl_amount: "1.00", ssl_invoice_number: inv }, ex).approved, false);
  assert.equal(judge({ ssl_result: "0", ssl_amount: "102.60", ssl_invoice_number: "OCOTHER" }, ex).approved, false);
  assert.equal(judge({ errorCode: "4025", errorMessage: "Invalid credentials" }, ex).approved, false);
  assert.equal(judge({ ssl_result: "0", ssl_amount: "102.60", ssl_trans_status: "VOID" }, ex).approved, false);
});

test("what's still owed", () => {
  assert.equal(amountDue(102.6, 0), 102.6);
  assert.equal(amountDue(119.7, 102.6), 17.1);
  assert.equal(amountDue(90, 102.6), 0);
});

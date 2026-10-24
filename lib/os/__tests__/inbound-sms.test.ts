import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { parseQuoEvent, intentOf, verifyQuo } from "../inbound-sms.ts";

test("STOP words turn texts off; 'cancel' is about a booking; normal chat is left alone", () => {
  for (const t of ["STOP", "stop", "Stop.", " STOP ALL", "Unsubscribe", "stop texting me", "QUIT", "Arret", "opt out"]) assert.equal(intentOf(t), "stop", t);
  for (const t of ["START", "unstop", "Start!"]) assert.equal(intentOf(t), "start", t);
  for (const t of ["Cancel", "cancel please", "Can I cancel?", "cancel my appointment"]) assert.equal(intentOf(t), "cancel", t);
  for (const t of ["Don't stop, see you at 10", "Can we stop by later", "stopping by at 3", "Thanks!", "end of the driveway"]) assert.equal(intentOf(t), "other", t);
});

test("reads both Quo webhook formats; ignores outgoing and other events", () => {
  assert.deepEqual(parseQuoEvent({ id: "EV1", type: "message.received", apiVersion: "v2", data: { object: { id: "AC1", object: "message", from: "+19025551234", to: "+19026408341", direction: "incoming", body: "STOP" } } }),
    { eventId: "EV1", messageId: "AC1", from: "+19025551234", to: "+19026408341", text: "STOP" });
  assert.deepEqual(parseQuoEvent({ id: "EV2", type: "message.received", apiVersion: "2026-03-30", data: { resource: { id: "AC2", text: "start" }, context: { senderIdentifier: "+19025551234", recipientIdentifiers: ["+19026408341"] } } }),
    { eventId: "EV2", messageId: "AC2", from: "+19025551234", to: "+19026408341", text: "start" });
  assert.equal(parseQuoEvent({ type: "message.delivered", data: {} }), null);
  assert.equal(parseQuoEvent({ type: "message.received", data: { object: { from: "+1", direction: "outgoing", body: "hi" } } }), null);
});

test("signature: real Quo signatures pass, tampered or old ones don't", () => {
  const key = crypto.randomBytes(24), secret = "whsec_" + key.toString("base64"), body = Buffer.from('{"type":"message.received"}');
  const now = 1_790_000_000_000, ts = String(now / 1000);
  const sig = crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`msg_1.${ts}.`), body])).digest("base64");
  assert.ok(verifyQuo(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret, now));
  assert.ok(!verifyQuo(Buffer.from('{"type":"x"}'), { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret, now));
  assert.ok(!verifyQuo(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret, now + 600_000));
  assert.ok(!verifyQuo(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, "", now));
  // older OpenPhone style
  const lsecret = key.toString("base64"), lts = String(now);
  const lsig = crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`${lts}.`), body])).digest("base64");
  assert.ok(verifyQuo(body, { legacy: `hmac;1;${lts};${lsig}` }, lsecret, now));
  assert.ok(!verifyQuo(body, { legacy: `hmac;1;${lts};AAAA${lsig.slice(4)}` }, lsecret, now));
});

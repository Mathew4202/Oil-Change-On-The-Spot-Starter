import { test } from "node:test";
import assert from "node:assert/strict";
import { newCode, hashCode, sameHash, signCustomer, readCustomer, codeText } from "../login-code.ts";

test("codes are 6 digits and only the hash is kept", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/);
  const h = hashCode("s3cret", "+19025551234", "042917");
  assert.ok(sameHash(h, hashCode("s3cret", "+19025551234", "042917")));
  assert.ok(!sameHash(h, hashCode("s3cret", "+19025551234", "042918")));
  assert.ok(!sameHash(h, hashCode("s3cret", "+19025559999", "042917")));   // same code, other phone
  assert.ok(!h.includes("042917"));
  assert.match(codeText("042917"), /042917.*10 minutes.*- \{signer\}$/);
});

test("customer cookie: valid, tampered, expired, and not usable as an owner cookie", () => {
  const id = "569b802d-c346-4d06-b645-c2c6ee21aac2", now = 1_790_000_000_000;
  const v = signCustomer("s3cret", id, now);
  assert.equal(readCustomer("s3cret", v, now + 1000), id);
  assert.equal(readCustomer("other", v, now), null);
  assert.equal(readCustomer("s3cret", v.replace(id, "11111111-c346-4d06-b645-c2c6ee21aac2"), now), null);
  assert.equal(readCustomer("s3cret", v, now + 181 * 86400000), null);
  assert.equal(readCustomer("s3cret", "mathew.9999999999999.abc", now), null);
  assert.equal(readCustomer("s3cret", undefined, now), null);
});

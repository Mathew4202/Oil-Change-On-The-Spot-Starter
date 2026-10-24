import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OWNER_PASSWORDS = ' "Mathew: pass123 , harsh=pass 456" ';
const { ownerList, checkPassword } = await import("../owners.ts");

test("forgiving format: quotes, spaces, = or :, capital names", () => {
  assert.deepEqual(ownerList(), [{ name: "mathew", password: "pass123" }, { name: "harsh", password: "pass 456" }]);
  assert.equal(checkPassword("Mathew", " pass123 "), "mathew");
  assert.equal(checkPassword("harsh", "pass 456"), "harsh");
  assert.equal(checkPassword("harsh", "pass123"), null);
});

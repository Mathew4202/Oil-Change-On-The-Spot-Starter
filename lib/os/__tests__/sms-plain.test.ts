import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText, segments } from "../text.ts";

test("curly quotes and dashes become plain, so a text stays cheap", () => {
  const t = plainText("We’ll see you — “tomorrow”… 2019 GMC Terrain • XLE");
  assert.equal(t, "We'll see you - \"tomorrow\"... 2019 GMC Terrain - XLE");
  assert.equal(segments("a".repeat(160)), 1);
  assert.equal(segments("a".repeat(161)), 2);
  assert.equal(segments("’" + "a".repeat(100)), 2);   // one curly quote: 70 per segment
  assert.equal(segments(t), 1);
});

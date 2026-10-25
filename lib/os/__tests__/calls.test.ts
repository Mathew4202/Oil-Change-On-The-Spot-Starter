import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCallEvent, pickSlot } from "../call-events.ts";

const ctx = { participants: { workspace: ["+19025550000"], external: ["+19025550122"] } };

test("call completed (current format)", () => {
  const e = parseCallEvent({ type: "call.completed", data: { resource: { id: "AC1", direction: "incoming", status: "unanswered", duration: null, createdAt: "2026-10-25T13:00:00Z" }, context: ctx } })!;
  assert.equal(e.kind, "completed"); assert.equal(e.callId, "AC1"); assert.equal(e.phone, "+19025550122"); assert.equal(e.status, "unanswered");
});

test("summary and transcript", () => {
  const s = parseCallEvent({ type: "call.summary.completed", data: { resource: { callId: "AC1", processingStatus: "completed", summary: ["Wants an oil change for a 2019 Civic"], nextSteps: ["Text booking link"],
    jobs: [{ name: "Intake", result: { data: [{ name: "Name", value: "Rita" }] } }] }, context: ctx } })!;
  assert.deepEqual(s.summary, ["Wants an oil change for a 2019 Civic"]); assert.equal(s.aiFields.Name, "Rita");
  const t = parseCallEvent({ type: "call.transcript.completed", data: { resource: { callId: "AC1", processingStatus: "completed",
    dialogue: [{ userId: "US1", content: "Oil Change On The Spot, how can I help?" }, { userId: null, identifier: "+19025550122", content: "Hi, I need an oil change Wednesday afternoon." }] }, context: ctx } })!;
  assert.match(t.transcript!, /Caller: Hi, I need an oil change Wednesday afternoon\./);
  assert.equal(parseCallEvent({ type: "call.summary.completed", data: { resource: { callId: "AC1", processingStatus: "in-progress", summary: null } } })!.summary, null);
  assert.equal(parseCallEvent({ type: "message.received", data: {} }), null);
});

test("older format call", () => {
  const e = parseCallEvent({ type: "call.completed", data: { object: { id: "AC2", direction: "incoming", from: "+19025550199", to: "+19025550000", status: "completed" } } })!;
  assert.equal(e.phone, "+19025550199");
});

test("pick the slot that matches what they asked for", () => {
  const slots = ["09:00", "09:30", "13:00", "14:30", "18:00"].map((time) => ({ time }));
  assert.equal(pickSlot(slots, { part: "afternoon" })?.time, "13:00");
  assert.equal(pickSlot(slots, { time: "14:00" })?.time, "14:30");
  assert.equal(pickSlot(slots, { time: "11:00" })?.time, "09:30");
  assert.equal(pickSlot(slots, { time: "21:30" }), null);
  assert.equal(pickSlot(slots, { part: "evening" })?.time, "18:00");
  assert.equal(pickSlot(slots, {})?.time, "09:00");
});

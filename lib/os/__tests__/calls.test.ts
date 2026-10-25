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

test("caller number from object participants, fromPhoneNumber, or the transcript", () => {
  const a = parseCallEvent({ type: "call.completed", data: { resource: { id: "AC9", direction: "incoming", status: "answered" }, context: { participants: { external: [{ phoneNumber: "+17826408341" }] } } } })!;
  assert.equal(a.phone, "+17826408341");
  const b = parseCallEvent({ type: "call.summary.completed", data: { resource: { callId: "AC9", processingStatus: "completed", summary: ["Wants an oil change"], fromPhoneNumber: "+17826408341" }, context: {} } })!;
  assert.equal(b.phone, "+17826408341"); assert.equal(b.callId, "AC9");
  const t = parseCallEvent({ type: "call.transcript.completed", data: { resource: { callId: "AC9", processingStatus: "completed",
    dialogue: [{ userId: null, identifier: "+17826408341", content: "Hi I need an oil change" }, { userId: "US1", identifier: null, content: "Sure thing" }] }, context: {} } })!;
  assert.equal(t.phone, "+17826408341");
});

test("no-AI backup reads car, service and day", async () => {
  const { basicExtract } = await import("../call-events.ts");
  const makes = ["Honda", "Toyota", "Chevrolet", "Mercedes-Benz", "Land Rover"];
  // Sunday Oct 25 2026
  const a = basicExtract("Hi, can I book an oil change for my 2019 Honda Civic Thursday afternoon? My name is Mike", makes, "2026-10-25")!;
  assert.equal(a.year, 2019); assert.equal(a.make, "Honda"); assert.equal(a.model, "Civic"); assert.equal(a.job, "oil_change");
  assert.equal(a.date, "2026-10-29"); assert.equal(a.part, "afternoon"); assert.equal(a.name, "Mike");
  const b = basicExtract("need winter tires swapped on my chevy cruze tomorrow at 3pm", makes, "2026-10-25")!;
  assert.equal(b.make, "Chevrolet"); assert.equal(b.model, "cruze"); assert.equal(b.job, "tires"); assert.equal(b.date, "2026-10-26"); assert.equal(b.time, "15:00");
  const c = basicExtract("oil change and tire swap for 2 cars sunday", makes, "2026-10-25")!;
  assert.equal(c.job, "seasonal"); assert.equal(c.cars, 2); assert.equal(c.date, "2026-11-01");
  assert.equal(basicExtract("thanks!", makes, "2026-10-25"), null);
});

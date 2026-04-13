import test from "node:test";
import assert from "node:assert/strict";
import { appendRunEvent, progressFromSteps, type RunEvent } from "./searchRunEvents.js";

test("appendRunEvent keeps latest events under cap", () => {
  const base: RunEvent[] = [
    { at: "1", type: "system", level: "info", message: "a" },
    { at: "2", type: "system", level: "info", message: "b" },
  ];
  const out = appendRunEvent(base, { at: "3", type: "step", level: "info", message: "c" }, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].message, "b");
  assert.equal(out[1].message, "c");
});

test("progressFromSteps computes rounded percentage", () => {
  const p = progressFromSteps([
    { status: "completed" },
    { status: "running" },
    { status: "completed" },
    { status: "pending" },
  ]);
  assert.equal(p, 50);
});


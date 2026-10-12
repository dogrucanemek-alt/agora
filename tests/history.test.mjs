import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "../scripts/history.mjs";

const facts = { probeUpdatedAt: "2026-10-13T05:41:09.000Z" };
const index = { servers: [
  { name: "a/up", live: { cls: "answers" } },
  { name: "a/up2", live: { cls: "answers" } },
  { name: "b/gated", live: { cls: "gated" } },
  { name: "c/down", live: { cls: "down" } },
  { name: "d/local" },
  { name: "e/unclassified", live: {} },
] };

test("the daily snapshot is filed under the check day and holds one class per checked server", () => {
  const s = snapshot(index, facts);
  assert.equal(s.date, "2026-10-13");
  assert.equal(s.checkedAt, facts.probeUpdatedAt);
  assert.deepEqual(s.servers, { "a/up": "answers", "a/up2": "answers", "b/gated": "gated", "c/down": "down" });
});
test("the snapshot's counts are the tally of its own servers; unchecked servers are not in it", () => {
  const s = snapshot(index, facts);
  assert.deepEqual(s.counts, { answers: 2, gated: 1, down: 1 });
  assert.equal(Object.values(s.counts).reduce((a, b) => a + b, 0), Object.keys(s.servers).length);
  assert.equal("d/local" in s.servers, false);
  assert.equal("e/unclassified" in s.servers, false);
});
test("a snapshot without a check time is refused rather than filed under a made-up day", () => {
  assert.throws(() => snapshot(index, {}), /probeUpdatedAt/);
  assert.throws(() => snapshot(index, { probeUpdatedAt: "yesterday" }), /probeUpdatedAt/);
});

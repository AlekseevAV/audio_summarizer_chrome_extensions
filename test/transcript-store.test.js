import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upsertDraft,
  removeDraft,
  pruneDrafts,
  recoverableDrafts,
} from "../chrome-extension/shared/transcript-store.js";

const DAY = 24 * 60 * 60 * 1000;

test("upsertDraft adds and replaces by id", () => {
  let drafts = {};
  drafts = upsertDraft(drafts, { id: "a", updatedAt: 1, timeline: "x" });
  assert.equal(drafts.a.timeline, "x");
  drafts = upsertDraft(drafts, { id: "a", updatedAt: 2, timeline: "y" });
  assert.equal(Object.keys(drafts).length, 1);
  assert.equal(drafts.a.timeline, "y");
});

test("removeDraft deletes by id and is immutable", () => {
  const drafts = { a: { id: "a" }, b: { id: "b" } };
  const next = removeDraft(drafts, "a");
  assert.deepEqual(Object.keys(next), ["b"]);
  assert.deepEqual(Object.keys(drafts), ["a", "b"]); // original untouched
});

test("pruneDrafts drops drafts older than the TTL", () => {
  const now = 100 * DAY;
  const drafts = {
    fresh: { id: "fresh", updatedAt: now - 1 * DAY },
    stale: { id: "stale", updatedAt: now - 8 * DAY },
  };
  const pruned = pruneDrafts(drafts, { now });
  assert.deepEqual(Object.keys(pruned), ["fresh"]);
});

test("pruneDrafts keeps only the most recent maxCount", () => {
  const now = 100 * DAY;
  const drafts = {};
  for (let i = 0; i < 15; i++) {
    drafts[`d${i}`] = { id: `d${i}`, updatedAt: now - i * 1000 };
  }
  const pruned = pruneDrafts(drafts, { now, maxCount: 10 });
  assert.equal(Object.keys(pruned).length, 10);
  // The 5 oldest (largest i) should be gone.
  assert.ok(pruned.d0);
  assert.ok(!pruned.d14);
});

test("recoverableDrafts excludes the current session and live drafts", () => {
  const now = 1_000_000;
  const drafts = {
    current: { id: "current", updatedAt: now - 5000 },
    live: { id: "live", updatedAt: now - 1000 }, // updated <60s ago
    orphan: { id: "orphan", updatedAt: now - 5 * 60 * 1000 },
  };
  const result = recoverableDrafts(drafts, { now, excludeId: "current" });
  assert.deepEqual(
    result.map((d) => d.id),
    ["orphan"],
  );
});

test("recoverableDrafts sorts most-recent first", () => {
  const now = 10 * DAY;
  const drafts = {
    older: { id: "older", updatedAt: now - 3 * DAY },
    newer: { id: "newer", updatedAt: now - 1 * DAY },
  };
  const result = recoverableDrafts(drafts, { now });
  assert.deepEqual(
    result.map((d) => d.id),
    ["newer", "older"],
  );
});

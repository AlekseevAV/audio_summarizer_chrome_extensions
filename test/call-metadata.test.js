import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeRange } from "../chrome-extension/content/call-metadata.js";

test("parses a time range with weekday", () => {
  const { startDate, endDate } = parseTimeRange(
    "Sat, Apr 12, 2025 9:45 PM - 10:30 PM",
  );

  // Times are parsed in the local timezone; check the wall-clock components,
  // which are timezone-independent here.
  assert.equal(startDate.getFullYear(), 2025);
  assert.equal(startDate.getHours(), 21);
  assert.equal(startDate.getMinutes(), 45);
  assert.equal(endDate.getHours(), 22);
  assert.equal(endDate.getMinutes(), 30);

  // 45 minute meeting.
  assert.equal((endDate - startDate) / 60000, 45);
});

test("parses a time range without weekday", () => {
  const { startDate, endDate } = parseTimeRange("Apr 12, 2025 9:45 PM - 10:30 PM");
  assert.equal(startDate.getHours(), 21);
  assert.equal(endDate.getHours(), 22);
});

test("returns valid fallback dates for an invalid format", () => {
  const { startDate, endDate } = parseTimeRange("not a real time");
  // Fallback is the current time - just assert we got usable Date objects.
  assert.ok(startDate instanceof Date);
  assert.ok(endDate instanceof Date);
  assert.ok(!isNaN(startDate.getTime()));
  assert.ok(!isNaN(endDate.getTime()));
});

test("returns valid fallback dates for an empty string", () => {
  const { startDate, endDate } = parseTimeRange("");
  assert.ok(!isNaN(startDate.getTime()));
  assert.ok(!isNaN(endDate.getTime()));
});

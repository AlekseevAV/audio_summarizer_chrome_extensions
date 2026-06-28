import { test } from "node:test";
import assert from "node:assert/strict";
import { msToTimestamp, buildMeetingMarkdown } from "../chrome-extension/shared/format.js";

test("msToTimestamp formats milliseconds as HH:MM:SS", () => {
  assert.equal(msToTimestamp(0), "00:00:00");
  assert.equal(msToTimestamp(1000), "00:00:01");
  assert.equal(msToTimestamp(61_000), "00:01:01");
  assert.equal(msToTimestamp(3_661_000), "01:01:01");
});

test("msToTimestamp floors sub-second values", () => {
  assert.equal(msToTimestamp(1999), "00:00:01");
});

test("msToTimestamp pads hours beyond 99", () => {
  // 100 hours -> still zero-padded to at least 2 digits, not truncated.
  assert.equal(msToTimestamp(100 * 3600 * 1000), "100:00:00");
});

const NOW = new Date("2026-06-28T08:00:00Z");

test("buildMeetingMarkdown uses the meeting start time for the date", () => {
  const md = buildMeetingMarkdown({
    callMetadata: {
      title: "Weekly sync",
      timeStart: new Date("2025-04-12T21:45:00Z"),
      participants: [{ name: "Alice" }, { name: "Bob" }],
      location: "Room 1",
      description: "Sprint planning",
    },
    summary: "Some summary",
    timeline: "[00:00:00 - 00:00:05]  hello",
    now: NOW,
  });

  assert.match(md, /^---\n/);
  assert.match(md, /title: "Weekly sync"/);
  assert.match(md, /date: 2025-04-12T21:45:00/);
  assert.match(md, /- "\[\[Alice\]\]"/);
  assert.match(md, /- "\[\[Bob\]\]"/);
  assert.match(md, /location: "Room 1"/);
  assert.match(md, /description: "Sprint planning"/);
  assert.match(md, /Some summary/);
  assert.match(md, /Transcription Timeline:\n\[00:00:00 - 00:00:05\]  hello/);
});

test("buildMeetingMarkdown falls back to `now` when there is no start time", () => {
  const md = buildMeetingMarkdown({
    callMetadata: { title: "No time call" },
    now: NOW,
  });
  assert.match(md, /date: 2026-06-28T08:00:00/);
});

test("buildMeetingMarkdown falls back to `now` for an invalid start time", () => {
  const md = buildMeetingMarkdown({
    callMetadata: { title: "Bad time", timeStart: "not-a-date" },
    now: NOW,
  });
  assert.match(md, /date: 2026-06-28T08:00:00/);
});

test("buildMeetingMarkdown handles missing metadata without throwing", () => {
  const md = buildMeetingMarkdown({ now: NOW });
  assert.match(md, /location: ""/);
  assert.match(md, /description: ""/);
  // No participants -> the participants line stays empty.
  assert.match(md, /participants: \nlocation:/);
});

test("buildMeetingMarkdown derives a title when none is provided", () => {
  const md = buildMeetingMarkdown({
    callMetadata: { time: "Sat, Apr 12, 2025" },
    now: NOW,
  });
  assert.match(md, /title: "Meeting Sat, Apr 12, 2025"/);
});

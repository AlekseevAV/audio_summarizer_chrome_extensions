import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  gatherCallMetadata,
  meetingDetailsFromDOM,
  meetingParticipantsFromDOM,
} from "../chrome-extension/content/call-metadata.js";

// A fixture that mimics the Google Meet DOM shape the scrapers rely on:
// - a "schedule" <i> marker whose grandparent holds the detail rows
// - a heading row with a tooltip (title), a free-text description row,
//   a schedule (time) row and a room (location) row
// - Participants / Guests panels with aria-labelled listitems
const FIXTURE = `<!doctype html><html><body>
  <div class="meeting-details">
    <div role="heading"><div role="tooltip">Weekly Sync</div></div>
    <div>Sprint planning discussion</div>
    <div><i>schedule</i><div>Sat, Apr 12, 2025 9:45 PM - 10:30 PM</div></div>
    <div><i>room</i><div>Meeting Room A</div></div>
  </div>

  <div aria-label="Participants">
    <div role="listitem" aria-label="Alice"></div>
    <div role="listitem" aria-label="Bob"></div>
  </div>
  <div aria-label="Guests">
    <div role="listitem" aria-label="Carol"></div>
  </div>
</body></html>`;

const dom = new JSDOM(FIXTURE);
globalThis.document = dom.window.document;

test("meetingDetailsFromDOM extracts title / description / time / location", async () => {
  const details = await meetingDetailsFromDOM();
  assert.equal(details.title, "Weekly Sync");
  assert.equal(details.description, "Sprint planning discussion");
  assert.equal(details.time, "Sat, Apr 12, 2025 9:45 PM - 10:30 PM");
  assert.equal(details.location, "Meeting Room A");
});

test("meetingParticipantsFromDOM collects participants and guests", async () => {
  const participants = await meetingParticipantsFromDOM();
  assert.deepEqual(
    participants.map((p) => p.name),
    ["Alice", "Bob", "Carol"],
  );
});

test("gatherCallMetadata combines details, participants and parsed times", async () => {
  const meta = await gatherCallMetadata();
  assert.equal(meta.title, "Weekly Sync");
  assert.equal(meta.location, "Meeting Room A");
  assert.equal(meta.participants.length, 3);
  // parseTimeRange should have populated start/end Date objects.
  assert.equal(meta.timeStart.getHours(), 21);
  assert.equal(meta.timeStart.getMinutes(), 45);
  assert.equal(meta.timeEnd.getHours(), 22);
});

test("meetingDetailsFromDOM degrades gracefully without a schedule marker", async () => {
  const empty = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.document = empty.window.document;
  try {
    const details = await meetingDetailsFromDOM();
    assert.equal(details.title, undefined);
    assert.equal(details.time, undefined);
  } finally {
    globalThis.document = dom.window.document;
  }
});

// Pure formatting helpers (no DOM / chrome dependencies) so they can be unit
// tested directly.

// Convert milliseconds to an HH:MM:SS timestamp.
export function msToTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Build the Obsidian-style Markdown (frontmatter + summary + timeline) from the
// gathered call metadata. `now` is injectable for deterministic tests; it is
// used only as a fallback when the call has no start time / title.
export function buildMeetingMarkdown({
  callMetadata,
  summary = "",
  timeline = "",
  now = new Date(),
} = {}) {
  const title =
    callMetadata?.title ||
    `Meeting ${callMetadata?.time || now.toLocaleDateString()}`;

  let participantsText = "";
  if (callMetadata?.participants && callMetadata.participants.length > 0) {
    participantsText = "\n";
    callMetadata.participants.forEach((p) => {
      participantsText += `  - "[[${p.name}]]"\n`;
    });
  }

  // Use the meeting start time if available, otherwise fall back to `now`.
  const startDate = callMetadata?.timeStart
    ? new Date(callMetadata.timeStart)
    : now;
  const dateText = isNaN(startDate.getTime())
    ? now.toISOString().slice(0, 19)
    : startDate.toISOString().slice(0, 19);

  return `---
title: "${title}"
date: ${dateText}
participants: ${participantsText}
location: "${callMetadata?.location || ""}"
description: "${callMetadata?.description || ""}"
tags:
  - meeting
---

${summary}

Transcription Timeline:
${timeline}
`;
}

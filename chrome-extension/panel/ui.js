import { log, error } from "./logger.js";
import {
  currentTabId,
  isRecording,
  isActivated,
  callMetadata,
  setIsActivated,
} from "./state.js";
import { startRecording, stopRecording } from "./recording.js";
import { notifyParentTooltip, notifyParentVisibility } from "./messages.js";

// DOM elements
const toggleButton = document.getElementById("transcription-toggle-button");
const panelEl = document.getElementById("live-transcription-panel");
const toggleRecordingBtn = document.getElementById("toggle-recording");
const closePanelBtn = document.getElementById("close-panel");
const copyBtn = document.getElementById("copy-transcription");
const saveBtn = document.getElementById("save-transcription");

// Status and display elements
const recordingStatusEl = document.getElementById("recording-status");
const livePreviewEl = document.getElementById("live-preview");
const timelineTextarea = document.getElementById("transcription-timeline");
const promptTextarea = document.getElementById("prompt-text");
const promptResultTextarea = document.getElementById("prompt-result");
const runPromptBtn = document.getElementById("run-prompt");

// Call metadata elements
const callTitleEl = document.getElementById("call-title");
const callTimeEl = document.getElementById("call-time");
const callParticipantsEl = document.getElementById("call-participants");

export async function initUI() {
  const settings = await chrome.storage.sync.get(["summary_prompt"]);
  const defaultPrompt =
    settings.summary_prompt ||
    "Make a concise structured summary of this transcription.";
  if (promptTextarea) {
    promptTextarea.value = defaultPrompt;
  }

  // Toggle button shows/hides panel
  toggleButton?.addEventListener("click", () => {
    if (!isActivated) {
      showActivationTooltip();
      return;
    }

    panelEl?.classList.toggle("visible");
    const visible = panelEl?.classList.contains("visible");
    notifyParentVisibility(visible);
    if (panelEl) {
      if (visible) {
        panelEl.style.width = "420px";
        panelEl.style.height = "100vh";
      } else {
        panelEl.style.width = "64px";
        panelEl.style.height = "64px";
      }
    }
    log(
      "Panel toggled:",
      panelEl?.classList.contains("visible") ? "visible" : "hidden",
    );
  });

  // Close button hides panel
  closePanelBtn?.addEventListener("click", () => {
    panelEl?.classList.remove("visible");
    notifyParentVisibility(false);
    log("Panel closed");
  });

  // Copy button
  copyBtn?.addEventListener("click", async () => {
    const meetingText = getMeetingDataAsText();
    try {
      await navigator.clipboard.writeText(meetingText);
    } catch (e) {
      error("Clipboard error:", e);
    }
  });

  // Save button
  saveBtn?.addEventListener("click", () => {
    const meetingTime =
      callMetadata?.time || new Date().toISOString().split("T")[0];

    const meetingTitle = callMetadata?.title
      ? callMetadata.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
      : "meeting";
    const fileName = `${meetingTime}-${meetingTitle}.md`;
    const meetingText = getMeetingDataAsText();

    const blob = new Blob([meetingText], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Start/Stop Recording button
  toggleRecordingBtn?.addEventListener("click", async () => {
    if (!isActivated) {
      showActivationTooltip();
      return;
    }

    if (!isRecording) {
      log("Start Recording clicked");

      if (!currentTabId) {
        setRecordingStatus("⚠️ No tab ID", "error");
        return;
      }

      setRecordingStatus("🔄 Starting...", "processing");
      await startRecording();
    } else {
      log("Stop Recording clicked");

      setRecordingStatus("🔄 Stopping...", "processing");
      await stopRecording();
    }
  });

  // Run prompt button
  runPromptBtn?.addEventListener("click", async () => {
    const transcript = timelineTextarea?.value || "";
    const userPrompt = (promptTextarea?.value || "").trim();

    if (!transcript.trim() || !userPrompt) return;

    // Get API key from storage
    const settings = await chrome.storage.sync.get(["openai_token"]);
    const apiKey = settings.openai_token;

    if (!apiKey) {
      promptResultTextarea.value = "⚠️ API key not configured";
      return;
    }

    if (promptResultTextarea) {
      promptResultTextarea.value = "⏳ Waiting for response...";
    }

    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5.2-2025-12-11",
          messages: [
            {
              role: "system",
              content: `
You are a senior product and engineering manager.
Your task is to create a concise, structured meeting summary
that is suitable for stakeholders who were not present.

The summary must:
- Be readable in under 3 minutes
- Focus on outcomes, not discussion flow
- Clearly separate facts, interpretations, decisions, and actions
- Avoid emotions, dialogue, and personal remarks
- Explicitly mark uncertainty and open questions`,
            },
            {
              role: "user",
              content: `${userPrompt}\n\n${transcript}`,
            },
          ],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        error("OpenAI error:", errText);
        if (promptResultTextarea) {
          promptResultTextarea.value = "⚠️ OpenAI error: " + errText;
        }
        return;
      }

      const data = await resp.json();
      const text = data.choices[0].message.content;

      if (promptResultTextarea) {
        promptResultTextarea.value = text;
        promptResultTextarea.scrollTop = promptResultTextarea.scrollHeight;
      }
    } catch (e) {
      error("Request failed:", e);
      if (promptResultTextarea) {
        promptResultTextarea.value = "⚠️ Request failed: " + e.message;
      }
    }
  });
}

// Recording status display
export function setRecordingStatus(text, mode) {
  if (!recordingStatusEl) return;
  recordingStatusEl.textContent = text;
  if (mode) {
    recordingStatusEl.dataset.mode = mode;
  } else {
    delete recordingStatusEl.dataset.mode;
  }
}

// Recording UI state
export function updateRecordingUI(isRecordingState) {
  if (isRecordingState) {
    toggleButton.textContent = "🔴"; // Red circle for recording
    toggleRecordingBtn.textContent = "⏹️";
    toggleRecordingBtn.title = "Stop Recording";
  } else {
    toggleButton.textContent = "⚪"; // White circle for not recording
    toggleRecordingBtn.textContent = "⏺️";
    toggleRecordingBtn.title = "Start Recording";
  }
}

// Activation state management
export function setActivationState(ready) {
  setIsActivated(ready);
  if (!toggleButton) return;
  if (ready) {
    toggleButton.classList.remove("locked");
    toggleButton.title = "Toggle Transcription Panel";
    toggleButton.classList.remove("show-tooltip");
    notifyParentTooltip(false);
  } else {
    toggleButton.classList.add("locked");
    toggleButton.title =
      "Нажмите на иконку расширения в панели Chrome, чтобы активировать";
  }
}

let tooltipTimer = null;
export function showActivationTooltip() {
  if (!toggleButton) return;
  toggleButton.classList.add("show-tooltip");
  notifyParentTooltip(true);
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
  }
  tooltipTimer = setTimeout(() => {
    toggleButton?.classList.remove("show-tooltip");
    notifyParentTooltip(false);
  }, 2500);
}

// Live preview text update
export function setLivePreviewUIText(text) {
  if (livePreviewEl) {
    livePreviewEl.textContent = text;

    // Light animation on update
    livePreviewEl.classList.remove("update");
    void livePreviewEl.offsetWidth;
    livePreviewEl.classList.add("update");
  }
}

// Timeline management
export function appendToTimeline(line) {
  if (!timelineTextarea) return;
  if (timelineTextarea.value) {
    timelineTextarea.value += "\n" + line;
  } else {
    timelineTextarea.value = line;
  }
  timelineTextarea.scrollTop = timelineTextarea.scrollHeight;
}

export function togglePanelVisibility() {
  toggleButton?.click();
}

// Set call metadata display
export function setCallMetadataUI(data) {
  callTitleEl.textContent = data.title || "N/A";
  callTimeEl.textContent = data.time || "N/A";
  callParticipantsEl.textContent =
    data.participants?.map((p) => p.name).join(", ") || "N/A";
}

// Meeting data formatting
export function getMeetingDataAsText() {
  let title =
    callMetadata?.title ||
    `Meeting ${callMetadata?.time || new Date().toLocaleDateString()}`;

  let participantsText = "";
  if (callMetadata?.participants && callMetadata.participants.length > 0) {
    participantsText = "\n";
    callMetadata.participants.forEach((p) => {
      participantsText += `  - "[[${p.name}]]"\n`;
    });
  }

  // Use the meeting start time if available, otherwise fall back to now.
  const startDate = callMetadata?.timeStart
    ? new Date(callMetadata.timeStart)
    : new Date();
  const dateText = isNaN(startDate.getTime())
    ? new Date().toISOString().slice(0, 19)
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

${promptResultTextarea?.value || ""}

Transcription Timeline:
${timelineTextarea?.value || ""}
`;
}

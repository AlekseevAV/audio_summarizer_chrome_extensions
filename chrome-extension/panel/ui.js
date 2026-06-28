import { log, error } from "./logger.js";
import {
  DEFAULT_SUMMARY_MODEL,
  DEFAULT_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_SUMMARY_PROMPT,
} from "../shared/defaults.js";
import { buildMeetingMarkdown } from "../shared/format.js";
import {
  currentTabId,
  isRecording,
  isActivated,
  callMetadata,
  currentDraftId,
  draftCreatedAt,
  isDirty,
  setIsActivated,
  setCurrentDraftId,
  setDraftCreatedAt,
  setIsDirty,
} from "./state.js";
import { startRecording, stopRecording } from "./recording.js";
import {
  notifyParentTooltip,
  notifyParentVisibility,
  notifyUnsavedState,
} from "./messages.js";
import { saveDraft, deleteDraft, listRecoverableDrafts } from "./drafts.js";

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

// Unsaved-transcript / recovery elements
const unsavedIndicatorEl = document.getElementById("unsaved-indicator");
const recoverySectionEl = document.getElementById("recovery-section");

export async function initUI() {
  const settings = await chrome.storage.sync.get(["summary_prompt"]);
  const defaultPrompt = settings.summary_prompt || DEFAULT_SUMMARY_PROMPT;
  if (promptTextarea) {
    promptTextarea.value = defaultPrompt;
  }

  // Offer recovery of any unsaved transcript from a previous session.
  renderRecovery();

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
      // Copying counts as exporting the transcript.
      markTranscriptExported();
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

    triggerDownload(fileName, getMeetingDataAsText());
    markTranscriptExported();
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

    // Get API key and summary settings from storage
    const settings = await chrome.storage.sync.get([
      "openai_token",
      "summary_model",
      "summary_system_prompt",
    ]);
    const apiKey = settings.openai_token;

    if (!apiKey) {
      promptResultTextarea.value = "⚠️ API key not configured";
      return;
    }

    const model = settings.summary_model || DEFAULT_SUMMARY_MODEL;
    const systemPrompt =
      settings.summary_system_prompt || DEFAULT_SUMMARY_SYSTEM_PROMPT;

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
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
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
        // The generated summary is unsaved content too.
        markTranscriptDirty();
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
  // New transcript content -> unsaved.
  markTranscriptDirty();
}

// --- Unsaved transcript / draft persistence ---------------------------------

let persistTimer = null;
let hasPersistedThisSession = false;
let draftGeneration = 0;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistDraftNow();
  }, 1000);
}

// Serialize Date fields to ISO strings so the storage round-trip is
// deterministic regardless of how the backend serializes Date objects.
function serializableCallMetadata(meta) {
  if (!meta) return null;
  const iso = (v) => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };
  return { ...meta, timeStart: iso(meta.timeStart), timeEnd: iso(meta.timeEnd) };
}

async function persistDraftNow() {
  if (!currentDraftId) return;
  const timeline = timelineTextarea?.value || "";
  const summary = promptResultTextarea?.value || "";
  if (!timeline.trim() && !summary.trim()) return;

  const id = currentDraftId;
  const gen = draftGeneration;
  try {
    await saveDraft({
      id,
      createdAt: draftCreatedAt || Date.now(),
      updatedAt: Date.now(),
      title: callMetadata?.title || null,
      callMetadata: serializableCallMetadata(callMetadata),
      timeline,
      summary,
    });
    // If the transcript was exported while this write was in flight, undo it
    // so the just-exported draft is not resurrected.
    if (gen !== draftGeneration) {
      await deleteDraft(id);
    }
  } catch (e) {
    error("Failed to persist transcript draft:", e);
  }
}

// Lazily create one draft id for the lifetime of this panel. The timeline
// textarea accumulates continuously across start/stop, so a single draft (kept
// updated) represents it - rather than a new draft per recording start.
function ensureDraftSession() {
  if (currentDraftId) return;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());
  setCurrentDraftId(id);
  setDraftCreatedAt(Date.now());
}

// Mark the transcript as having unsaved content and persist it.
export function markTranscriptDirty() {
  ensureDraftSession();
  setIsDirty(true);
  updateUnsavedIndicator();
  notifyUnsavedState(true);
  // Persist the first change immediately so the beforeunload guard never
  // promises data that is not yet in storage; debounce subsequent updates.
  if (!hasPersistedThisSession) {
    hasPersistedThisSession = true;
    persistDraftNow();
  } else {
    schedulePersist();
  }
}

// The transcript was exported (saved to file or copied) - clear the dirty
// state and drop the persisted draft.
export async function markTranscriptExported() {
  setIsDirty(false);
  updateUnsavedIndicator();
  notifyUnsavedState(false);
  draftGeneration += 1; // invalidate any in-flight persist
  hasPersistedThisSession = false; // new content after this persists eagerly again
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const id = currentDraftId;
  if (id) {
    try {
      await deleteDraft(id);
    } catch (e) {
      error("Failed to delete transcript draft:", e);
    }
  }
}

function updateUnsavedIndicator() {
  if (unsavedIndicatorEl) unsavedIndicatorEl.hidden = !isDirty;
}

function triggerDownload(fileName, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadDraft(draft) {
  const text = buildMeetingMarkdown({
    callMetadata: draft.callMetadata,
    summary: draft.summary || "",
    timeline: draft.timeline || "",
  });
  const safeTitle = (draft.title || "meeting")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  triggerDownload(`${safeTitle}.md`, text);
}

// Render the "recover unsaved transcript" section, if any drafts qualify.
export async function renderRecovery() {
  if (!recoverySectionEl) return;

  let drafts = [];
  try {
    drafts = await listRecoverableDrafts(currentDraftId);
  } catch (e) {
    error("Failed to load recoverable drafts:", e);
    return;
  }

  recoverySectionEl.replaceChildren();
  if (!drafts.length) {
    recoverySectionEl.hidden = true;
    return;
  }
  recoverySectionEl.hidden = false;

  const header = document.createElement("div");
  header.className = "recovery-header";
  header.textContent = "⚠ Unsaved transcript from a previous session";
  recoverySectionEl.appendChild(header);

  drafts.forEach((draft) => {
    const item = document.createElement("div");
    item.className = "recovery-item";

    const label = document.createElement("span");
    label.className = "recovery-item-label";
    const when = new Date(draft.updatedAt || draft.createdAt || Date.now());
    label.textContent = `${draft.title || "Meeting"} — ${when.toLocaleString()}`;
    item.appendChild(label);

    const dlBtn = document.createElement("button");
    dlBtn.className = "recovery-btn";
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", async () => {
      downloadDraft(draft);
      await deleteDraft(draft.id);
      renderRecovery();
    });
    item.appendChild(dlBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "recovery-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      await deleteDraft(draft.id);
      renderRecovery();
    });
    item.appendChild(delBtn);

    recoverySectionEl.appendChild(item);
  });

  if (drafts.length > 1) {
    const delAll = document.createElement("button");
    delAll.className = "recovery-btn recovery-btn-all";
    delAll.textContent = "Delete all";
    delAll.addEventListener("click", async () => {
      for (const d of drafts) await deleteDraft(d.id);
      renderRecovery();
    });
    recoverySectionEl.appendChild(delAll);
  }
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

// Meeting data formatting. The pure builder lives in shared/format.js; here we
// only feed it the current DOM values.
export function getMeetingDataAsText() {
  return buildMeetingMarkdown({
    callMetadata,
    summary: promptResultTextarea?.value || "",
    timeline: timelineTextarea?.value || "",
  });
}

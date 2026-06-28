import {
  MESSAGE_TYPES,
  MESSAGE_SOURCES,
  MESSAGE_TARGETS,
} from "../shared/message-types.js";
import { activeSession, setActiveSession } from "./state.js";
import { setActionIcon } from "./icon.js";
import { ensureOffscreenDocument } from "./offscreen.js";

// Start recording for a specific tab
export async function startRecordingForTab(tabId, streamId) {
  // If same tab already recording, ignore
  if (
    activeSession &&
    activeSession.tabId === tabId &&
    activeSession.status === "recording"
  ) {
    return;
  }

  // If another tab is active, stop it first
  if (activeSession && activeSession.tabId !== tabId) {
    await stopRecordingForTab(activeSession.tabId, "new-tab-start");
  }

  setActiveSession({ tabId, status: "starting" });

  await ensureOffscreenDocument();
  const settings = await chrome.storage.sync.get([
    "openai_token",
    "transcription_model",
  ]);

  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.BACKGROUND,
    target: MESSAGE_TARGETS.OFFSCREEN,
    type: MESSAGE_TYPES.START_RECORDING,
    tabId,
    streamId,
    apiKey: settings.openai_token,
    model: settings.transcription_model,
  });

  setActionIcon(tabId, true);
}

// Stop recording for a specific tab
export async function stopRecordingForTab(tabId, reason = "user-stop") {
  if (!activeSession || activeSession.tabId !== tabId) return;
  activeSession.status = "stopping";

  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.BACKGROUND,
    target: MESSAGE_TARGETS.OFFSCREEN,
    type: MESSAGE_TYPES.STOP_RECORDING,
    tabId,
    reason,
  });

  setActionIcon(tabId, false);
}

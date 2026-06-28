import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import { currentTabId } from "./state.js";
import { setRecordingStatus } from "./ui.js";
import { log } from "./logger.js";

// Start recording function
export async function startRecording() {
  try {
    setRecordingStatus("🔄 Starting...", "processing");

    // First, request microphone permissions from panel context (has user gesture)
    log("Requesting microphone permissions from panel...");
    setRecordingStatus("🎤 Requesting microphone access...", "processing");
    const tempMicStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    // Stop immediately after getting permission
    tempMicStream.getTracks().forEach((track) => track.stop());
    log("Microphone permissions granted");

    setRecordingStatus("🔄 Getting tab stream...", "processing");
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: currentTabId,
    });
    log("Obtained streamId:", streamId);

    chrome.runtime.sendMessage({
      source: MESSAGE_SOURCES.PANEL,
      type: MESSAGE_TYPES.START_RECORDING,
      tabId: currentTabId,
      streamId,
    });

    return true; // Indicate that the request was successfully sent
  } catch (error) {
    console.error("Failed to start recording:", error);
    setRecordingStatus(`❌ Error: ${error.message}`, "error");
    return false;
  }
}

// Stop recording function
export async function stopRecording() {
  log("Stopping recording...");

  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.PANEL,
    type: MESSAGE_TYPES.STOP_RECORDING,
    tabId: currentTabId,
  });

  log("Recording stop request sent");
}

import {
  MESSAGE_SOURCES,
  MESSAGE_TARGETS,
  MESSAGE_TYPES,
} from "../shared/message-types.js";
import {
  segmentTimes,
  livePreviewText,
  setLivePreviewText,
  setCallMetadata,
  setIsRecording,
} from "./state.js";
import {
  setRecordingStatus,
  updateRecordingUI,
  appendToTimeline,
  togglePanelVisibility,
  setCallMetadataUI,
  setActivationState,
  setLivePreviewUIText,
} from "./ui.js";
import { log, warn, error, debug } from "./logger.js";
import { msToTimestamp } from "../shared/format.js";

export function notifyParentTooltip(isVisible) {
  try {
    window.parent?.postMessage(
      {
        source: MESSAGE_SOURCES.PANEL,
        type: MESSAGE_TYPES.ACTIVATION_TOOLTIP,
        visible: !!isVisible,
      },
      "*",
    );
  } catch (e) {
    error("Failed to notify parent tooltip visibility:", e);
  }
}

// Notify parent about visibility so content script can resize iframe hit area
export function notifyParentVisibility(isVisible) {
  try {
    window.parent?.postMessage(
      {
        source: MESSAGE_SOURCES.PANEL,
        type: MESSAGE_TYPES.PANEL_VISIBILITY,
        visible: !!isVisible,
      },
      "*",
    );
  } catch (e) {
    error("Failed to notify parent visibility:", e);
  }
}

export function setupWindowMessageListener() {
  window.addEventListener("message", (event) => {
    if (!event.data) return;

    const { source, type, data, target } = event.data;

    // Messages from background via content relay
    if (
      source === MESSAGE_SOURCES.BACKGROUND &&
      target === MESSAGE_TARGETS.PANEL
    ) {
      const { type, payload, error: errorMsg } = event.data;

      switch (type) {
        case MESSAGE_TYPES.RECORDING_STARTED:
          log("Recording started in offscreen");
          setIsRecording(true);
          setRecordingStatus("⏺️ Recording...", "recording");
          updateRecordingUI(true);
          break;

        case MESSAGE_TYPES.RECORDING_STOPPED:
          log("Recording stopped in offscreen");
          setIsRecording(false);
          setRecordingStatus("■ Stopped", "idle");
          updateRecordingUI(false);
          break;

        case MESSAGE_TYPES.ERROR:
          error("Recording error:", errorMsg);
          setIsRecording(false);
          setRecordingStatus(
            `⚠️ Error: ${errorMsg?.message || errorMsg}`,
            "error",
          );
          updateRecordingUI(false);
          break;

        case MESSAGE_TYPES.TRANSCRIPTION_EVENT:
          handleWebSocketEvent(payload);
          break;

        case MESSAGE_TYPES.CONNECTION_STATUS:
          if (payload?.state === "reconnecting") {
            setRecordingStatus(
              `🔁 Reconnecting${payload.attempt ? ` (${payload.attempt})` : ""}...`,
              "processing",
            );
          } else if (payload?.state === "reconnected") {
            setRecordingStatus("⏺️ Recording...", "recording");
          }
          break;

        default:
          log("Unknown background message type:", type);
      }
      return;
    }

    // From content script
    if (source === MESSAGE_SOURCES.CONTENT) {
      switch (type) {
        case MESSAGE_TYPES.CALL_METADATA:
          log("Received call metadata:", data);
          setCallMetadata(data);
          setCallMetadataUI(data);
          break;
        case MESSAGE_TYPES.ACTIVATION_GRANTED:
          log("Activation granted by content script");
          setActivationState(true);
          break;
        case MESSAGE_TYPES.TOGGLE_PANEL_REQUEST:
          log("Received toggle-panel request from content script.");
          togglePanelVisibility();
          break;
        default:
          warn("Unhandled message from content:", type);
      }
      return;
    }
  });
}

// Handle WebSocket events
export function handleWebSocketEvent(data) {
  switch (data.type) {
    case "session.created":
    case "session.updated":
      log("Session ready");
      break;

    case "input_audio_buffer.speech_started":
      handleSpeechStarted(data);
      break;

    case "input_audio_buffer.speech_stopped":
      handleSpeechStopped(data);
      break;

    case "conversation.item.input_audio_transcription.delta":
      handleTranscriptionDelta(data);
      break;

    case "conversation.item.input_audio_transcription.completed":
      handleTranscriptionCompleted(data);
      break;

    case "error":
      error("Realtime error:", data.error);
      setRecordingStatus("⚠️ Error", "error");
      break;

    default:
      debug("Unhandled event type:", data.type);
      break;
  }
}

// Speech started (VAD)
function handleSpeechStarted(event) {
  setRecordingStatus("🎙️ Speaking...", "speaking");

  setLivePreviewText("");
  setLivePreviewUIText("");

  if (event.item_id) {
    const prev = segmentTimes.get(event.item_id) || {};
    segmentTimes.set(event.item_id, {
      ...prev,
      startMs: event.audio_start_ms ?? prev.startMs,
    });
  }
}

// Speech stopped (VAD)
function handleSpeechStopped(event) {
  setRecordingStatus("⏺️ Processing...", "processing");

  if (event.item_id) {
    const prev = segmentTimes.get(event.item_id) || {};
    segmentTimes.set(event.item_id, {
      ...prev,
      endMs: event.audio_end_ms ?? prev.endMs,
    });
  }
}

// Transcription completed
function handleTranscriptionCompleted(event) {
  const text =
    event.transcript ||
    event.item?.input_audio?.transcription?.transcript ||
    "";

  if (!text || !text.trim()) return;

  const itemId = event.item_id || event.item?.id;
  const times = (itemId && segmentTimes.get(itemId)) || {};
  const startMs = times.startMs ?? times.endMs ?? 0;
  const endMs = times.endMs ?? startMs;

  const startTs = msToTimestamp(startMs);
  const endTs = msToTimestamp(endMs);

  const line = `[${startTs} - ${endTs}]  ${text.trim()}`;
  appendToTimeline(line);

  setRecordingStatus("⏺️ Recording...", "idle");
}

// Transcription delta
// (timestamp formatting lives in shared/format.js)
function handleTranscriptionDelta(event) {
  const chunk = event.delta || "";
  if (!chunk) return;

  // Append to live preview (last phrase)
  const newText = livePreviewText + chunk;
  setLivePreviewText(newText);
  setLivePreviewUIText(newText);
  setRecordingStatus("🎙️ Speaking...", "speaking");
}

import { MESSAGE_TYPES, MESSAGE_TARGETS } from "../shared/message-types.js";
import { currentSession } from "./state.js";
import { debug, warn } from "./logger.js";
import { startRecording, stopRecordingInternal } from "./recording.js";

// Message listener
export function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== MESSAGE_TARGETS.OFFSCREEN) return;

    debug("Received message:", message);

    switch (message.type) {
      case MESSAGE_TYPES.START_RECORDING:
        startRecording(message);
        break;
      case MESSAGE_TYPES.STOP_RECORDING:
        if (currentSession && currentSession.tabId === message.tabId) {
          stopRecordingInternal(message.reason || "background-stop");
        }
        break;
      case MESSAGE_TYPES.MIC_MUTE_CHANGE:
        if (
          currentSession &&
          currentSession.tabId === message.tabId &&
          currentSession.micStream
        ) {
          currentSession.micStream.getTracks().forEach((t) => {
            t.enabled = !message.isMuted;
          });
        }
        break;

      default:
        warn("Unknown message type:", message.type);
        return;
    }
  });
}

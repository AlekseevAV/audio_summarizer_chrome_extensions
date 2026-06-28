import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import { log, error } from "./logger.js";

// Connect to the OpenAI Realtime transcription socket. Resolves with the open
// WebSocket once the session is configured, or rejects if it closes before
// opening. `onClose` is invoked only for closes that happen AFTER a successful
// open (steady-state drops), so the caller can decide whether to reconnect.
export async function connectWebSocket(tabId, apiKey, model, onClose) {
  return new Promise((resolve, reject) => {
    let opened = false;
    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", "openai-insecure-api-key." + apiKey],
    );

    ws.onopen = () => {
      opened = true;
      log("WebSocket connected");

      // Configure session for transcription
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                transcription: {
                  model: model,
                  prompt: "",
                },
                turn_detection: {
                  type: "semantic_vad",
                },
              },
            },
            include: ["item.input_audio_transcription.logprobs"],
          },
        }),
      );

      // Resolve promise only after connection is ready
      resolve(ws);
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      chrome.runtime.sendMessage({
        source: MESSAGE_SOURCES.OFFSCREEN,
        type: MESSAGE_TYPES.TRANSCRIPTION_EVENT,
        tabId,
        payload: data,
      });
    };

    // Just log errors; the authoritative decision (reject / reconnect) is made
    // in onclose, which always follows onerror.
    ws.onerror = (e) => {
      error("WebSocket error:", e);
    };

    ws.onclose = (event) => {
      log("WebSocket closed", event?.code, event?.reason);
      if (!opened) {
        reject(new Error(`WebSocket closed before open (code ${event?.code})`));
        return;
      }
      onClose?.(event);
    };
  });
}

import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import { log, error } from "./logger.js";

// WebSocket connection - wait for open before returning
export async function connectWebSocket(tabId, apiKey, model, onStopRecording) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", "openai-insecure-api-key." + apiKey],
    );

    ws.onopen = () => {
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

    ws.onerror = (e) => {
      error("WebSocket error:", e);
      chrome.runtime.sendMessage({
        source: MESSAGE_SOURCES.OFFSCREEN,
        type: MESSAGE_TYPES.ERROR,
        tabId,
        error: { message: "WebSocket error" },
      });
      onStopRecording("ws-error");
      reject(e);
    };

    ws.onclose = (event) => {
      log("WebSocket closed", event?.code, event?.reason);
      // Unexpected close (network drop, server-initiated close, auth failure
      // after open): make sure recording is torn down so it does not keep
      // running silently. stopRecordingInternal is a no-op once the session is
      // already cleared (our own stop path), so this is safe against recursion.
      onStopRecording("ws-closed");
    };
  });
}

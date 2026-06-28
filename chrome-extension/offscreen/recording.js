import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import {
  currentSession,
  setCurrentSession,
  clearCurrentSession,
} from "./state.js";
import { log, error } from "./logger.js";
import { connectWebSocket } from "./websocket.js";
import { startPCMStreaming } from "./audio.js";

// Tear down a set of audio resources. Safe to call with partially-created
// resources - every field is optional and guarded. Never throws, never blocks
// (AudioContext.close() is fire-and-forget so callers never wait on it).
function teardownResources(resources) {
  const {
    ws,
    audioContext,
    monitorContext,
    tabStream,
    micStream,
    combinedStream,
    workletNode,
  } = resources;

  // Stop feeding the graph first: detach the worklet handler and disconnect,
  // so no stray PCM is produced once we start closing things.
  try {
    if (workletNode) workletNode.port.onmessage = null;
  } catch {}
  try {
    workletNode?.disconnect();
  } catch {}

  // Stop all tracks so capture indicators turn off and the graph goes idle.
  try {
    tabStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
  } catch {}
  try {
    micStream?.getTracks().forEach((t) => t.stop());
  } catch {}
  try {
    combinedStream?.getTracks().forEach((t) => t.stop());
  } catch {}

  // Close the socket (covers CONNECTING too, not just OPEN).
  try {
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close(1000, "stop");
    }
  } catch {}

  // Close audio contexts last, fire-and-forget. We must never await these:
  // close() can stall, and blocking here previously hung the stop flow.
  audioContext?.close().catch(() => {});
  monitorContext?.close().catch(() => {});
}

// Start recording
export async function startRecording({ tabId, streamId, apiKey, model }) {
  // If something is already running, stop first
  if (currentSession) {
    await stopRecordingInternal("new-session");
  }

  // Track resources as we create them so we can clean up even if we fail
  // before a session is established.
  const resources = {};

  try {
    // 1. Get tab audio stream using provided streamId
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });
    resources.tabStream = tabStream;

    // Stop if tab audio ends
    const [tabTrack] = tabStream.getAudioTracks();
    if (tabTrack) {
      tabTrack.onended = () => {
        log("Tab audio track ended");
        stopRecordingInternal("tab-audio-ended");
      };
    }

    // 2. Get microphone stream
    const micDevice = await navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        log(
          "Available audio devices:",
          devices.filter((d) => d.kind === "audioinput").map((d) => d.label),
        );
        return devices.find(
          (device) =>
            device.kind === "audioinput" &&
            // deviceId === "default" is locale-independent; the label check is
            // a fallback for browsers that do not expose the synthetic id.
            (device.deviceId === "default" ||
              device.label.toLowerCase().includes("default")),
        );
      });

    if (!micDevice) {
      const all_mics_labels = await navigator.mediaDevices
        .enumerateDevices()
        .then((devices) =>
          devices
            .filter((device) => device.kind === "audioinput")
            .map((d) => d.label),
        );
      error(
        "Default microphone not found. Available microphones:",
        all_mics_labels,
      );
      throw new Error("Default microphone not found");
    }

    log("Selected microphone:", micDevice.label);
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: {
          exact: micDevice.deviceId,
        },
      },
      video: false,
    });
    resources.micStream = micStream;

    // 3. Play tab audio to speakers (monitoring)
    const monitorContext = new AudioContext();
    resources.monitorContext = monitorContext;
    const monitorSource = monitorContext.createMediaStreamSource(tabStream);
    monitorSource.connect(monitorContext.destination);

    // 4. Combine streams for processing
    const audioContext = new AudioContext({ sampleRate: 24000 });
    resources.audioContext = audioContext;
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    tabSource.connect(destination);
    micSource.connect(destination);
    const combinedStream = destination.stream;
    resources.combinedStream = combinedStream;

    // 5. Connect WebSocket
    const ws = await connectWebSocket(
      tabId,
      apiKey,
      model || "gpt-4o-transcribe",
      stopRecordingInternal,
    );
    resources.ws = ws;

    // 6. Start PCM streaming
    const workletNode = await startPCMStreaming(
      audioContext,
      combinedStream,
      ws,
    );
    resources.workletNode = workletNode;

    setCurrentSession({
      tabId,
      ws,
      audioContext,
      monitorContext,
      tabStream,
      micStream,
      combinedStream,
      workletNode,
    });

    chrome.runtime.sendMessage({
      source: MESSAGE_SOURCES.OFFSCREEN,
      type: MESSAGE_TYPES.RECORDING_STARTED,
      tabId,
    });
  } catch (e) {
    error("Failed to start recording:", e);
    chrome.runtime.sendMessage({
      source: MESSAGE_SOURCES.OFFSCREEN,
      type: MESSAGE_TYPES.ERROR,
      tabId,
      error: { message: e.message },
    });
    // Clean up whatever we managed to create. The session was never set, so
    // stopRecordingInternal would no-op here - tear down resources directly.
    teardownResources(resources);
  }
}

// Stop recording
export async function stopRecordingInternal(reason) {
  if (!currentSession) return;
  const session = currentSession;

  // Clear the session first so any re-entrant calls (e.g. ws.onclose firing
  // after we close the socket) become no-ops.
  clearCurrentSession();

  // Notify listeners BEFORE tearing down audio. AudioContext.close() can stall,
  // and previously the stop notification waited on it - hanging the panel on
  // "Stopping...". The UI must not depend on teardown completing.
  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.RECORDING_STOPPED,
    tabId: session.tabId,
    reason,
  });

  teardownResources(session);
}

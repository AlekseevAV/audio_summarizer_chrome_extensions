import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import {
  currentSession,
  setCurrentSession,
  clearCurrentSession,
} from "./state.js";
import { log, error } from "./logger.js";
import { connectWebSocket } from "./websocket.js";
import { startPCMStreaming } from "./audio.js";

// Start recording
export async function startRecording({ tabId, streamId, apiKey, model }) {
  // If something is already running, stop first
  if (currentSession) {
    await stopRecordingInternal("new-session");
  }

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
        log("Available audio devices:", devices.filter(d => d.kind === "audioinput").map(d => d.label));
        return devices.find(
          (device) =>
            device.kind === "audioinput" &&
            device.label.toLowerCase().includes("default"),
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

    // 3. Play tab audio to speakers (monitoring)
    const monitorContext = new AudioContext();
    const monitorSource = monitorContext.createMediaStreamSource(tabStream);
    monitorSource.connect(monitorContext.destination);

    // 4. Combine streams for processing
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    tabSource.connect(destination);
    micSource.connect(destination);
    const combinedStream = destination.stream;

    // 5. Connect WebSocket
    const ws = await connectWebSocket(
      tabId,
      apiKey,
      model || "gpt-4o-transcribe",
      stopRecordingInternal,
    );

    // 6. Start PCM streaming
    const workletNode = await startPCMStreaming(
      audioContext,
      combinedStream,
      ws,
    );

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
    await stopRecordingInternal("start-failed");
  }
}

// Stop recording
export async function stopRecordingInternal(reason) {
  if (!currentSession) return;
  const {
    tabId,
    ws,
    audioContext,
    monitorContext,
    tabStream,
    micStream,
    combinedStream,
    workletNode,
  } = currentSession;

  clearCurrentSession();

  try {
    workletNode?.disconnect();
  } catch {}

  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, reason);
    }
  } catch {}

  try {
    await audioContext?.close();
  } catch {}

  try {
    await monitorContext?.close();
  } catch {}

  try {
    // Remove onended handler before stopping to avoid recursive calls
    tabStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    micStream?.getTracks().forEach((t) => t.stop());
    combinedStream?.getTracks().forEach((t) => t.stop());
  } catch {}

  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.RECORDING_STOPPED,
    tabId,
    reason,
  });
}

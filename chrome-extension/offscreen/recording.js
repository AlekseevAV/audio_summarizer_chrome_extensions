import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import {
  currentSession,
  setCurrentSession,
  clearCurrentSession,
} from "./state.js";
import { log, error } from "./logger.js";
import { connectWebSocket } from "./websocket.js";
import { startPCMStreaming } from "./audio.js";

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

// Serialize start/stop so overlapping messages (e.g. a tab switch sending STOP
// then START) can never run two pipelines concurrently and leak resources.
let opChain = Promise.resolve();
function enqueue(task) {
  const result = opChain.then(task, task);
  // Keep the chain alive regardless of individual task outcome.
  opChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

export function startRecording(message) {
  return enqueue(() => doStart(message));
}

export function stopRecordingInternal(reason) {
  return enqueue(() => doStop(reason));
}

// --- Notifications -------------------------------------------------------

function notifyError(tabId, message) {
  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.ERROR,
    tabId,
    error: { message },
  });
}

function notifyConnectionStatus(tabId, state, attempt) {
  chrome.runtime.sendMessage({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.CONNECTION_STATUS,
    tabId,
    payload: { state, attempt },
  });
}

// --- Teardown ------------------------------------------------------------

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
    reconnectTimer,
  } = resources;

  if (reconnectTimer) clearTimeout(reconnectTimer);

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

// --- Reconnect -----------------------------------------------------------

// Called when a socket that was previously open closes unexpectedly. Only the
// active session's socket matters; stale/intentional closes are ignored.
function onSocketClosed(closedWs) {
  if (!currentSession || currentSession.ws !== closedWs) return;
  scheduleReconnect();
}

function scheduleReconnect() {
  const session = currentSession;
  if (!session) return;

  if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (session.stopping) return;
    session.stopping = true;
    error("Reconnect failed after max attempts");
    notifyError(session.tabId, "Connection lost - recording stopped");
    // Stop via the queue so it serializes with any pending start/stop.
    stopRecordingInternal("reconnect-failed");
    return;
  }

  session.reconnectAttempts += 1;
  const delay = Math.min(
    RECONNECT_BASE_MS * 2 ** (session.reconnectAttempts - 1),
    RECONNECT_MAX_MS,
  );
  notifyConnectionStatus(session.tabId, "reconnecting", session.reconnectAttempts);
  log(
    `Scheduling reconnect attempt ${session.reconnectAttempts} in ${delay}ms`,
  );
  session.reconnectTimer = setTimeout(() => doReconnect(session), delay);
}

async function doReconnect(session) {
  session.reconnectTimer = null;
  // Aborted if the session was stopped/replaced while we waited.
  if (currentSession !== session) return;

  try {
    const ws = await connectWebSocket(
      session.tabId,
      session.apiKey,
      session.model,
      (event) => onSocketClosed(ws),
    );

    // Stopped during the (awaited) connect: discard the fresh socket.
    if (currentSession !== session) {
      try {
        ws.close(1000, "stop");
      } catch {}
      return;
    }

    session.ws = ws;
    session.reconnectAttempts = 0;
    log("Reconnected");
    notifyConnectionStatus(session.tabId, "reconnected");
  } catch (e) {
    error("Reconnect attempt failed:", e);
    scheduleReconnect();
  }
}

// --- Start / Stop --------------------------------------------------------

async function doStart({ tabId, streamId, apiKey, model }) {
  // Ignore duplicate starts for a tab that is already being recorded. Covers
  // the "starting" window the background-level guard misses (a second START
  // could otherwise tear down and reinitialize a healthy pipeline).
  if (currentSession && currentSession.tabId === tabId) {
    log("Already recording this tab, ignoring duplicate start");
    return;
  }

  // A different tab is active - stop it first (inline: we are already in the
  // op queue, so calling the queued version would deadlock).
  if (currentSession) {
    await doStop("new-session");
  }

  // Track resources as we create them so we can clean up even if we fail
  // before a session is established.
  const resources = { reconnectAttempts: 0, reconnectTimer: null };

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
      (event) => onSocketClosed(ws),
    );
    resources.ws = ws;

    // 6. Start PCM streaming. The sender resolves the live socket per chunk so
    // reconnects retarget the stream without rebuilding the audio graph.
    const workletNode = await startPCMStreaming(
      audioContext,
      combinedStream,
      () => currentSession?.ws,
    );
    resources.workletNode = workletNode;

    setCurrentSession({
      tabId,
      apiKey,
      model: model || "gpt-4o-transcribe",
      ws,
      audioContext,
      monitorContext,
      tabStream,
      micStream,
      combinedStream,
      workletNode,
      reconnectAttempts: 0,
      reconnectTimer: null,
    });

    chrome.runtime.sendMessage({
      source: MESSAGE_SOURCES.OFFSCREEN,
      type: MESSAGE_TYPES.RECORDING_STARTED,
      tabId,
    });
  } catch (e) {
    error("Failed to start recording:", e);
    notifyError(tabId, e.message);
    // Clean up whatever we managed to create. The session was never set, so
    // doStop would no-op here - tear down resources directly.
    teardownResources(resources);
  }
}

async function doStop(reason) {
  if (!currentSession) return;
  const session = currentSession;

  // Clear the session first so any re-entrant calls (e.g. ws.onclose firing
  // after we close the socket) become no-ops and no reconnect is scheduled.
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

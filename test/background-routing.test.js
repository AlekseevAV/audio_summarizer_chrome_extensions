import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createChromeMock } from "./helpers/chrome-mock.js";

// The background router reads the global `chrome`, so install the mock before
// importing the module under test (dynamic import after the assignment).
const chrome = createChromeMock();
globalThis.chrome = chrome;

const { setupChromeMessageListener } = await import(
  "../chrome-extension/background/messages.js"
);
const state = await import("../chrome-extension/background/state.js");
const { MESSAGE_TYPES, MESSAGE_SOURCES, MESSAGE_TARGETS } = await import(
  "../chrome-extension/shared/message-types.js"
);

setupChromeMessageListener();

const flush = () => new Promise((r) => setTimeout(r, 10));
const panelMessages = () => chrome.tabs.sendMessage.calls.map((c) => c[1]);
const runtimeMessages = () => chrome.runtime.sendMessage.calls.map((c) => c[0]);

beforeEach(() => {
  chrome._reset();
  state.clearActiveSession();
});

test("answers GET_TAB_ID with the sender's tab id", () => {
  const response = chrome._dispatch(
    { type: MESSAGE_TYPES.GET_TAB_ID },
    { tab: { id: 99 } },
  );
  assert.deepEqual(response, { tabId: 99 });
});

test("routes panel START_RECORDING to the offscreen document", async () => {
  chrome._dispatch({
    source: MESSAGE_SOURCES.PANEL,
    type: MESSAGE_TYPES.START_RECORDING,
    tabId: 3,
    streamId: "stream-abc",
  });
  await flush();

  const start = runtimeMessages().find(
    (m) =>
      m.target === MESSAGE_TARGETS.OFFSCREEN &&
      m.type === MESSAGE_TYPES.START_RECORDING,
  );
  assert.ok(start, "expected a START_RECORDING message to offscreen");
  assert.equal(start.tabId, 3);
  assert.equal(start.streamId, "stream-abc");
  // The offscreen document must be created on demand.
  assert.equal(chrome.offscreen.createDocument.calls.length, 1);
});

test("relays offscreen RECORDING_STARTED to the panel", () => {
  state.setActiveSession({ tabId: 7, status: "starting" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.RECORDING_STARTED,
    tabId: 7,
  });

  const [tabId, msg] = chrome.tabs.sendMessage.calls[0];
  assert.equal(tabId, 7);
  assert.equal(msg.target, MESSAGE_TARGETS.PANEL);
  assert.equal(msg.type, MESSAGE_TYPES.RECORDING_STARTED);
  // Active session should flip to "recording".
  assert.equal(state.activeSession.status, "recording");
});

test("relays offscreen RECORDING_STOPPED to the panel and clears the session", () => {
  state.setActiveSession({ tabId: 7, status: "recording" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.RECORDING_STOPPED,
    tabId: 7,
    reason: "user-stop",
  });

  const stopped = panelMessages().find(
    (m) => m.type === MESSAGE_TYPES.RECORDING_STOPPED,
  );
  assert.ok(stopped, "expected RECORDING_STOPPED relayed to the panel");
  assert.equal(stopped.tabId, 7);
  assert.equal(stopped.reason, "user-stop");
  assert.equal(state.activeSession, null);
});

test("relays transcription events to the panel", () => {
  chrome._dispatch({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.TRANSCRIPTION_EVENT,
    tabId: 4,
    payload: { type: "delta", delta: "hi" },
  });

  const evt = panelMessages().find(
    (m) => m.type === MESSAGE_TYPES.TRANSCRIPTION_EVENT,
  );
  assert.ok(evt);
  assert.deepEqual(evt.payload, { type: "delta", delta: "hi" });
});

test("relays reconnect CONNECTION_STATUS to the panel", () => {
  chrome._dispatch({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.CONNECTION_STATUS,
    tabId: 4,
    payload: { state: "reconnecting", attempt: 2 },
  });

  const evt = panelMessages().find(
    (m) => m.type === MESSAGE_TYPES.CONNECTION_STATUS,
  );
  assert.ok(evt);
  assert.deepEqual(evt.payload, { state: "reconnecting", attempt: 2 });
});

test("relays offscreen ERROR to the panel and clears the active session", () => {
  state.setActiveSession({ tabId: 8, status: "starting" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.OFFSCREEN,
    type: MESSAGE_TYPES.ERROR,
    tabId: 8,
    error: { message: "boom" },
  });

  const err = panelMessages().find((m) => m.type === MESSAGE_TYPES.ERROR);
  assert.ok(err);
  assert.equal(err.error.message, "boom");
  assert.equal(state.activeSession, null);
});

test("forwards content MIC_MUTE_CHANGE to offscreen for the active tab", () => {
  state.setActiveSession({ tabId: 5, status: "recording" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.CONTENT,
    type: MESSAGE_TYPES.MIC_MUTE_CHANGE,
    tabId: 5,
    isMuted: true,
  });

  const mute = runtimeMessages().find(
    (m) =>
      m.target === MESSAGE_TARGETS.OFFSCREEN &&
      m.type === MESSAGE_TYPES.MIC_MUTE_CHANGE,
  );
  assert.ok(mute);
  assert.equal(mute.isMuted, true);
});

test("ignores MIC_MUTE_CHANGE for a non-active tab", () => {
  state.setActiveSession({ tabId: 5, status: "recording" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.CONTENT,
    type: MESSAGE_TYPES.MIC_MUTE_CHANGE,
    tabId: 999,
    isMuted: true,
  });

  const mute = runtimeMessages().find(
    (m) => m.type === MESSAGE_TYPES.MIC_MUTE_CHANGE,
  );
  assert.equal(mute, undefined);
});

test("content LEAVE_CALL stops recording for the active tab", async () => {
  state.setActiveSession({ tabId: 5, status: "recording" });
  chrome._dispatch({
    source: MESSAGE_SOURCES.CONTENT,
    type: MESSAGE_TYPES.LEAVE_CALL,
    tabId: 5,
  });
  await flush();

  const stop = runtimeMessages().find(
    (m) =>
      m.target === MESSAGE_TARGETS.OFFSCREEN &&
      m.type === MESSAGE_TYPES.STOP_RECORDING,
  );
  assert.ok(stop, "expected STOP_RECORDING sent to offscreen");
});

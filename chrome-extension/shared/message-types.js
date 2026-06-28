// Message types used throughout the extension

export const MESSAGE_TYPES = {
  // Recording control
  START_RECORDING: "start-recording",
  STOP_RECORDING: "stop-recording",
  RECORDING_STARTED: "recording-started",
  RECORDING_STOPPED: "recording-stopped",

  // Transcription
  TRANSCRIPTION_EVENT: "transcription-event",

  // Panel control
  TOGGLE_PANEL_VISIBILITY: "toggle-panel-visibility",
  TOGGLE_PANEL_REQUEST: "toggle-panel-request",
  PANEL_VISIBILITY: "panel-visibility",

  ACTIVATION_TOOLTIP: "activation-tooltip",
  ACTIVATION_GRANTED: "activation-granted",
  CALL_METADATA: "call-metadata",

  // Content script events
  MIC_MUTE_CHANGE: "mic-mute-change",
  LEAVE_CALL: "leave-call",

  // Errors
  ERROR: "error",

  // Utility
  GET_TAB_ID: "get-tab-id",
  BLINK_ACTION_ICON: "blink-action-icon",
};

export const MESSAGE_SOURCES = {
  BACKGROUND: "background",
  OFFSCREEN: "offscreen",
  PANEL: "panel",
  CONTENT: "content",
};

export const MESSAGE_TARGETS = {
  BACKGROUND: "background",
  OFFSCREEN: "offscreen",
  PANEL: "panel",
  CONTENT: "content",
};

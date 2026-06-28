// Application state management
export let isRecording = false;
export let isActivated = false;
export let callMetadata = null;
export let livePreviewText = "";
export let currentTabId = null;

// Segment times storage
export const segmentTimes = new Map(); // item_id -> { startMs?: number, endMs?: number }

// State setters
export function setIsRecording(value) {
  isRecording = value;
}

export function setIsActivated(value) {
  isActivated = value;
}

export function setCallMetadata(value) {
  callMetadata = value;
}

export function setLivePreviewText(value) {
  livePreviewText = value;
}

export function setCurrentTabId(value) {
  currentTabId = value;
}

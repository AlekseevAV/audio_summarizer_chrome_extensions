// Application state management
export let isRecording = false;
export let isActivated = false;
export let callMetadata = null;
export let livePreviewText = "";
export let currentTabId = null;

// Draft persistence / unsaved-transcript tracking
export let currentDraftId = null;
export let draftCreatedAt = null;
export let isDirty = false;

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

export function setCurrentDraftId(value) {
  currentDraftId = value;
}

export function setDraftCreatedAt(value) {
  draftCreatedAt = value;
}

export function setIsDirty(value) {
  isDirty = value;
}

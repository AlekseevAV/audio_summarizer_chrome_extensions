import { activeSession } from "./state.js";
import { log } from "./logger.js";

// Ensure offscreen document exists
export async function ensureOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  } else {
    // Fallback for older API: scan contexts
    const contexts = await chrome.runtime.getContexts({});
    const offscreenDocument = contexts.find(
      (c) => c.contextType === "OFFSCREEN_DOCUMENT",
    );
    if (offscreenDocument) return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Capture tab + mic audio and stream to OpenAI Realtime",
  });
  log("Offscreen document created");
}

// Close offscreen document if no active session
export async function closeOffscreenIfIdle() {
  if (activeSession) return;
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      await chrome.offscreen.closeDocument();
      log("Offscreen document closed (idle)");
    }
  }
}

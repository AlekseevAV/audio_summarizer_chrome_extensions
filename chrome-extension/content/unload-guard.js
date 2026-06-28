import { log } from "./logger.js";

// The content script runs in the top-level Meet page, so it can arm a
// window.beforeunload guard to warn the user before they close/reload/navigate
// away with an unsaved transcript. The native dialog text is browser-controlled
// and cannot be customized; this just triggers it.

let guardActive = false;

function beforeUnloadHandler(event) {
  event.preventDefault();
  // Required by some browsers to actually show the prompt.
  event.returnValue = "";
  return "";
}

export function setUnsavedGuard(dirty) {
  if (dirty && !guardActive) {
    window.addEventListener("beforeunload", beforeUnloadHandler);
    guardActive = true;
    log("Unsaved-transcript guard armed");
  } else if (!dirty && guardActive) {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    guardActive = false;
    log("Unsaved-transcript guard disarmed");
  }
}

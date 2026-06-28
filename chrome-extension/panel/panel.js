import { setCurrentTabId } from "./state.js";
import { setActivationState, initUI } from "./ui.js";
import { log } from "./logger.js";
import {
  setupWindowMessageListener,
  notifyParentVisibility,
} from "./messages.js";

log("Extension page loaded in iframe");

// Get Tab ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tabId = parseInt(urlParams.get("tabId"));

if (!tabId) {
  console.error("[panel] No tabId provided in URL!");
} else {
  log("Running in tab:", tabId);
  setCurrentTabId(tabId);
}

// Initialize application
async function init() {
  log("Initializing transcription panel...");
  // Send initial collapsed state on load
  notifyParentVisibility(false);

  // Initialize UI event handlers
  initUI();
  setupWindowMessageListener();
  setActivationState(false);
}

log("transcription-panel.js loaded");
init();

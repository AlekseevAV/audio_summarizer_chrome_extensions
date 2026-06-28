import { MESSAGE_TYPES } from "../shared/message-types.js";
import {
  currentTabId,
  activationHintEl,
  setActivationHintEl,
  setPanelIframe,
  setCurrentTabId,
} from "./state.js";
import { log, error } from "./logger.js";

// Show activation hint
export function showActivationHint() {
  if (activationHintEl) {
    activationHintEl.style.display = "flex";
    if (currentTabId) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.BLINK_ACTION_ICON,
        tabId: currentTabId,
        enable: true,
      });
    }
    return;
  }

  const hintEl = document.createElement("div");
  hintEl.id = "panel-activation-hint";
  hintEl.style.cssText = `
    position: fixed;
    top: 12px;
    right: 72px;
    max-width: 320px;
    padding: 12px 14px;
    background: rgba(32,33,36,0.96);
    color: #e8eaed;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    font-size: 13px;
    line-height: 1.5;
    z-index: 10002;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    pointer-events: none;
  `;

  const arrow = document.createElement("div");
  arrow.style.cssText = `
    width: 12px;
    height: 12px;
    background: rgba(32,33,36,0.96);
    border-left: 1px solid rgba(255,255,255,0.12);
    border-top: 1px solid rgba(255,255,255,0.12);
    transform: rotate(45deg);
    position: absolute;
    top: -6px;
    right: 32px;
    box-shadow: 2px -2px 6px rgba(0,0,0,0.35);
  `;

  const text = document.createElement("div");
  text.textContent =
    "Click the extension icon to activate the transcription panel.";

  hintEl.appendChild(text);
  hintEl.appendChild(arrow);

  document.body.appendChild(hintEl);
  setActivationHintEl(hintEl);

  if (currentTabId) {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.BLINK_ACTION_ICON,
      tabId: currentTabId,
      enable: true,
    });
  }
}

// Hide activation hint
export function hideActivationHint() {
  if (activationHintEl) {
    activationHintEl.style.display = "none";
  }
  if (currentTabId) {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.BLINK_ACTION_ICON,
      tabId: currentTabId,
      enable: false,
    });
  }
}

// Inject transcription panel iframe
export async function injectTranscriptionPanel() {
  log("Injecting transcription panel iframe...");

  // First, get our tab ID from background
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_TAB_ID }, (response) => {
    const tabId = response?.tabId;

    if (!tabId) {
      error("Failed to get tab ID");
      return;
    }

    log("Got tab ID:", tabId);
    setCurrentTabId(tabId);

    // Create iframe for panel (extension page with full chrome API access)
    const iframe = document.createElement("iframe");
    iframe.id = "transcription-panel-iframe";
    // Add autoplay for audio playback
    iframe.setAttribute("allow", "microphone; clipboard-write; autoplay");
    // Pass tabId via URL parameter so panel can use chrome.tabCapture directly!
    iframe.src = chrome.runtime.getURL(
      `panel.html?tabId=${tabId}`,
    );

    // Style the iframe container. Start collapsed so only the toggle button is clickable.
    iframe.style.cssText = `
      all: initial;
      position: fixed;
      top: 0;
      left: 0;
      width: 64px;
      height: 64px;
      border: none;
      pointer-events: auto;
      z-index: 10000;
      background: transparent;
    `;

    document.body.appendChild(iframe);
    setPanelIframe(iframe);

    log("Panel iframe injected successfully with tabId");
  });
}

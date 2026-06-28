import { MESSAGE_TYPES } from "../shared/message-types.js";
import { activeSession } from "./state.js";
import { log } from "./logger.js";
import { stopRecordingForTab } from "./recording.js";
import { setupChromeMessageListener } from "./messages.js";

// Listen for click on the extension icon
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes("meet.google.com")) {
    log("Action icon clicked, sending toggle-panel message to tab:", tab.id);
    chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.TOGGLE_PANEL_VISIBILITY,
    });
  } else {
    log("Action icon clicked on non-Meet page, ignoring.");
  }
});

// Stop if tab closed or navigated away from Meet
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSession?.tabId === tabId) {
    stopRecordingForTab(tabId, "tab-closed");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeSession || activeSession.tabId !== tabId) return;
  if (changeInfo.url && !changeInfo.url.includes("meet.google.com")) {
    stopRecordingForTab(tabId, "navigated-away");
  }
});

// Message routing
setupChromeMessageListener();

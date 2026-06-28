import {
  MESSAGE_TYPES,
  MESSAGE_SOURCES,
  MESSAGE_TARGETS,
} from "../shared/message-types.js";
import { activeSession, clearActiveSession } from "./state.js";
import { startBlink, stopBlink } from "./icon.js";
import { closeOffscreenIfIdle } from "./offscreen.js";
import { startRecordingForTab, stopRecordingForTab } from "./recording.js";
import { debug } from "./logger.js";

// Handle messages from different sources
export function setupChromeMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debug("Received message:", message, "from", sender);

    // Panel -> background
    if (message.source === MESSAGE_SOURCES.PANEL) {
      handlePanelMessage(message);
      return;
    }

    // Content -> background
    if (message.source === MESSAGE_SOURCES.CONTENT) {
      handleContentMessage(message);
      return;
    }

    // Offscreen -> background
    if (message.source === MESSAGE_SOURCES.OFFSCREEN) {
      handleOffscreenMessage(message);
      return;
    }

    // Utility handlers
    if (message.type === MESSAGE_TYPES.GET_TAB_ID) {
      sendResponse({ tabId: sender.tab?.id });
      return true;
    }

    if (message.type === MESSAGE_TYPES.BLINK_ACTION_ICON) {
      const { tabId, enable } = message;
      if (enable) {
        startBlink(tabId);
      } else {
        stopBlink(tabId);
      }
      return;
    }
  });
}

// Handle messages from panel
async function handlePanelMessage(message) {
  switch (message.type) {
    case MESSAGE_TYPES.START_RECORDING:
      try {
        await startRecordingForTab(message.tabId, message.streamId);
      } catch (error) {
        console.error("Failed to start recording:", error);
        // Send error back to panel
        chrome.tabs.sendMessage(message.tabId, {
          source: MESSAGE_SOURCES.BACKGROUND,
          target: MESSAGE_TARGETS.PANEL,
          type: MESSAGE_TYPES.ERROR,
          tabId: message.tabId,
          error: { message: error.message },
        });
      }
      break;
    case MESSAGE_TYPES.STOP_RECORDING:
      await stopRecordingForTab(message.tabId, "user-stop");
      break;
  }
}

// Handle messages from content script
function handleContentMessage(message) {
  switch (message.type) {
    case MESSAGE_TYPES.MIC_MUTE_CHANGE:
      if (activeSession && activeSession.tabId === message.tabId) {
        chrome.runtime.sendMessage({
          source: MESSAGE_SOURCES.BACKGROUND,
          target: MESSAGE_TARGETS.OFFSCREEN,
          type: MESSAGE_TYPES.MIC_MUTE_CHANGE,
          tabId: message.tabId,
          isMuted: message.isMuted,
        });
      }
      break;

    case MESSAGE_TYPES.LEAVE_CALL:
      if (activeSession && activeSession.tabId === message.tabId) {
        stopRecordingForTab(message.tabId, "call-ended");
      }
      break;
  }
}

// Handle messages from offscreen document
function handleOffscreenMessage(message) {
  switch (message.type) {
    case MESSAGE_TYPES.RECORDING_STARTED:
      if (activeSession && activeSession.tabId === message.tabId) {
        activeSession.status = "recording";
      }
      // Background -> Panel
      chrome.tabs.sendMessage(message.tabId, {
        source: MESSAGE_SOURCES.BACKGROUND,
        target: MESSAGE_TARGETS.PANEL,
        type: MESSAGE_TYPES.RECORDING_STARTED,
        tabId: message.tabId,
      });
      break;
    case MESSAGE_TYPES.RECORDING_STOPPED:
      if (activeSession && activeSession.tabId === message.tabId) {
        clearActiveSession();
      }
      // Background -> Panel
      chrome.tabs.sendMessage(message.tabId, {
        source: MESSAGE_SOURCES.BACKGROUND,
        target: MESSAGE_TARGETS.PANEL,
        type: MESSAGE_TYPES.RECORDING_STOPPED,
        tabId: message.tabId,
        reason: message.reason,
      });
      closeOffscreenIfIdle();
      break;
    case MESSAGE_TYPES.TRANSCRIPTION_EVENT:
      // Background -> Panel
      chrome.tabs.sendMessage(message.tabId, {
        source: MESSAGE_SOURCES.BACKGROUND,
        target: MESSAGE_TARGETS.PANEL,
        type: MESSAGE_TYPES.TRANSCRIPTION_EVENT,
        tabId: message.tabId,
        payload: message.payload,
      });
      break;
    case MESSAGE_TYPES.ERROR:
      // Background -> Panel
      chrome.tabs.sendMessage(message.tabId, {
        source: MESSAGE_SOURCES.BACKGROUND,
        target: MESSAGE_TARGETS.PANEL,
        type: MESSAGE_TYPES.ERROR,
        tabId: message.tabId,
        error: message.error,
      });
      break;
  }
}

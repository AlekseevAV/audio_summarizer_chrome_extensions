import { MESSAGE_TYPES, MESSAGE_SOURCES, MESSAGE_TARGETS } from "../shared/message-types.js";
import { panelIframe, setPanelActivated } from "./state.js";
import { log } from "./logger.js";
import { showActivationHint, hideActivationHint } from "./panel.js";
import { setUnsavedGuard } from "./unload-guard.js";

// Setup window message listener (for messages from panel iframe)
export function setupWindowMessageListener() {
  window.addEventListener("message", (event) => {
    if (!event?.data || event.data.source !== MESSAGE_SOURCES.PANEL) return;

    const { type, visible } = event.data;

    if (type === MESSAGE_TYPES.PANEL_VISIBILITY && panelIframe) {
      if (visible) {
        panelIframe.style.width = "420px";
        panelIframe.style.height = "100vh";
      } else {
        panelIframe.style.width = "64px";
        panelIframe.style.height = "64px";
      }
      return;
    }

    if (type === MESSAGE_TYPES.ACTIVATION_TOOLTIP) {
      if (visible) {
        showActivationHint();
      } else {
        hideActivationHint();
      }
      return;
    }

    if (type === MESSAGE_TYPES.UNSAVED_STATE) {
      setUnsavedGuard(!!event.data.dirty);
    }
  });
}

// Setup chrome runtime message listener (for messages from background)
export function setupChromeMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MESSAGE_TYPES.TOGGLE_PANEL_VISIBILITY) {
      log(
        "Received toggle-panel-visibility from background. Relaying to panel.",
      );
      setPanelActivated(true);
      hideActivationHint();
      if (panelIframe?.contentWindow) {
        panelIframe.contentWindow.postMessage(
          {
            source: MESSAGE_SOURCES.CONTENT,
            type: MESSAGE_TYPES.ACTIVATION_GRANTED,
          },
          "*",
        );
      }
      if (panelIframe?.contentWindow) {
        panelIframe.contentWindow.postMessage(
          {
            source: MESSAGE_SOURCES.CONTENT,
            type: MESSAGE_TYPES.TOGGLE_PANEL_REQUEST,
          },
          "*",
        );
      }
    }

    // Recording status relayed from background to panel via content if needed
    if (message.source === MESSAGE_SOURCES.BACKGROUND && message.target === MESSAGE_TARGETS.PANEL) {
      if (panelIframe?.contentWindow) {
        panelIframe.contentWindow.postMessage(message, "*");
      }
    }
  });
}

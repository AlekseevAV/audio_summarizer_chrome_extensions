import { MESSAGE_TYPES, MESSAGE_SOURCES } from "../shared/message-types.js";
import { currentTabId, panelIframe } from "./state.js";
import { log, error } from "./logger.js";

// Wait for mute button to appear
function waitForMuteButton() {
  return new Promise((resolve) => {
    const checkExist = setInterval(() => {
      const muteButton = document.querySelector("[data-is-muted]");
      if (muteButton) {
        clearInterval(checkExist);
        resolve(muteButton);
      }
    }, 1000);
  });
}

// Initialize microphone mute state observer
export async function initMuteObserver() {
  const muteButton = await waitForMuteButton();
  if (!muteButton) {
    error("Mute button not found!");
    return;
  }

  let isMuted = muteButton.getAttribute("data-is-muted") === "true";

  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-is-muted"
      ) {
        isMuted = muteButton.getAttribute("data-is-muted") === "true";
        log("Microphone mute state changed:", isMuted ? "Muted" : "Unmuted");

        if (currentTabId) {
          chrome.runtime.sendMessage({
            source: MESSAGE_SOURCES.CONTENT,
            type: MESSAGE_TYPES.MIC_MUTE_CHANGE,
            tabId: currentTabId,
            isMuted,
          });
        }
      }
    }
  });

  observer.observe(muteButton, {
    attributes: true,
    attributeFilter: ["data-is-muted"],
  });

  log("Mute observer initialized.");
}

// Wait for leave call button to appear
function waitForLeaveCallButton() {
  return new Promise((resolve) => {
    const checkExist = setInterval(() => {
      const leaveCallButton = document.querySelector(
        'button[aria-label="Leave call"]',
      );
      if (leaveCallButton) {
        clearInterval(checkExist);
        resolve(leaveCallButton);
      }
    }, 1000);
  });
}

// Initialize leave call observer
export async function initLeaveCallObserver() {
  const leaveCallButton = await waitForLeaveCallButton();
  if (!leaveCallButton) {
    error("Leave call button not found!");
    return;
  }

  leaveCallButton.addEventListener("click", async () => {
    log("Leaving the call...");
    if (currentTabId) {
      chrome.runtime.sendMessage({
        source: MESSAGE_SOURCES.CONTENT,
        type: MESSAGE_TYPES.LEAVE_CALL,
        tabId: currentTabId,
      });
    }
  });

  log("Leave call observer initialized.");
}

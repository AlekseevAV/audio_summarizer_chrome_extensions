let blinkTimer = null;
let blinkState = false;

// Set action icon
export function setActionIcon(tabId, isRecordingIcon) {
  const path = isRecordingIcon
    ? "icons/recording.png"
    : "icons/not-recording.png";
  chrome.action.setIcon({ tabId, path });
}

// Stop blinking the action icon
export function stopBlink(tabId) {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  setActionIcon(tabId, false);
}

// Start blinking the action icon to attract attention
export function startBlink(tabId) {
  if (blinkTimer) {
    clearInterval(blinkTimer);
  }
  blinkState = false;
  let ticks = 0;
  const timer = setInterval(() => {
    blinkState = !blinkState;
    setActionIcon(tabId, blinkState);
    ticks += 1;
    if (ticks >= 6) {
      stopBlink(tabId);
    }
  }, 350);
  blinkTimer = timer;
}

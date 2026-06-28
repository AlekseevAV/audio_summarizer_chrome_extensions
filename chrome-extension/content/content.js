import { log } from "./logger.js";
import { updateCallMetadata } from "./call-metadata.js";
import { initMuteObserver, initLeaveCallObserver } from "./observers.js";
import { injectTranscriptionPanel } from "./panel.js";
import { setupWindowMessageListener, setupChromeMessageListener } from "./messages.js";

// Initialize observers
initMuteObserver();
initLeaveCallObserver();

// Wait for the call fully loaded and trigger the details and people tabs
// to load the data
const checkExist = setInterval(async () => {
  const navBarElement = document.querySelector("nav");
  if (!navBarElement) {
    log("Waiting for nav bar to load...");
    return;
  }
  let detailsButton = null;
  let peopleButton = null;

  for (let button of navBarElement.querySelectorAll("button")) {
    if (button.ariaLabel.startsWith("Meeting details")) {
      detailsButton = button;
    }
    if (button.ariaLabel.startsWith("People")) {
      peopleButton = button;
    }
  }

  if (detailsButton && peopleButton) {
    clearInterval(checkExist);
    // Open and close the details and people tabs to load the data
    detailsButton.click();
    detailsButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    peopleButton.click();
    peopleButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    updateCallMetadata();

    // Periodically update the call metadata
    setInterval(() => {
      updateCallMetadata();
    }, 10 * 1000);
  } else {
    log("Waiting for details and people buttons to load...");
  }
}, 1000); // check every 1s

// Inject panel when Meet page loads
window.addEventListener("load", () => {
  // Wait for Meet to initialize
  setTimeout(() => {
    injectTranscriptionPanel();
  }, 2000);
});

// Setup message listeners
setupWindowMessageListener();
setupChromeMessageListener();

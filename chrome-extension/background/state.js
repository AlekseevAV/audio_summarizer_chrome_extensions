// Active recording session tracking
export let activeSession = null; // { tabId, status: "starting"|"recording"|"stopping" }

// State setters
export function setActiveSession(session) {
  activeSession = session;
}

export function clearActiveSession() {
  activeSession = null;
}

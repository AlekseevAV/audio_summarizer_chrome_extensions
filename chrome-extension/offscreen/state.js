// State for current session
export let currentSession = null;
// currentSession = {
//   tabId, ws, audioContext, monitorContext,
//   tabStream, micStream, combinedStream, workletNode
// }

export function setCurrentSession(session) {
  currentSession = session;
}

export function clearCurrentSession() {
  currentSession = null;
}

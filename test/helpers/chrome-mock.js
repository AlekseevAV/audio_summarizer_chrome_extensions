// Minimal fake of the subset of the `chrome.*` extension API that the
// background message router touches. Records calls so tests can assert on
// routing/relay behavior without a real browser.

function recorder(returnValue) {
  const fn = (...args) => {
    fn.calls.push(args);
    return returnValue;
  };
  fn.calls = [];
  return fn;
}

function asyncRecorder(resolved) {
  const fn = async (...args) => {
    fn.calls.push(args);
    return resolved;
  };
  fn.calls = [];
  return fn;
}

export function createChromeMock() {
  const listeners = [];

  const chrome = {
    runtime: {
      onMessage: {
        addListener: (cb) => listeners.push(cb),
      },
      sendMessage: recorder(),
      getContexts: async () => [],
      getURL: (p) => p,
    },
    tabs: {
      sendMessage: recorder(),
    },
    action: {
      setIcon: recorder(),
    },
    offscreen: {
      hasDocument: async () => false,
      createDocument: asyncRecorder(),
      closeDocument: asyncRecorder(),
    },
    storage: {
      sync: {
        get: async () => ({}),
      },
    },

    // --- test helpers (not part of the real API) ---

    // Deliver a message to every registered onMessage listener. Returns the
    // value passed to sendResponse, if any (used by GET_TAB_ID).
    _dispatch(message, sender = {}) {
      let response;
      for (const cb of listeners) {
        cb(message, sender, (r) => {
          response = r;
        });
      }
      return response;
    },

    // Clear all recorded calls between tests.
    _reset() {
      this.runtime.sendMessage.calls.length = 0;
      this.tabs.sendMessage.calls.length = 0;
      this.action.setIcon.calls.length = 0;
      this.offscreen.createDocument.calls.length = 0;
      this.offscreen.closeDocument.calls.length = 0;
    },
  };

  return chrome;
}

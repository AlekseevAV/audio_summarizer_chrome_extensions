// Content script state
export let panelIframe = null;
export let currentTabId = null;
export let panelActivated = false;
export let activationHintEl = null;

export function setPanelIframe(iframe) {
  panelIframe = iframe;
}

export function setCurrentTabId(tabId) {
  currentTabId = tabId;
}

export function setPanelActivated(activated) {
  panelActivated = activated;
}

export function setActivationHintEl(el) {
  activationHintEl = el;
}

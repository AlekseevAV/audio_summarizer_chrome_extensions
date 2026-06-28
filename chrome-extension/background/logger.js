// Logging utilities
export function log(...args) {
  console.log("[background] ", ...args);
}

export function debug(...args) {
  console.debug("[background] ", ...args);
}

export function warn(...args) {
  console.warn("[background] ", ...args);
}

export function error(...args) {
  console.error("[background] ", ...args);
}

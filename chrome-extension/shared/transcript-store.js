// Pure logic for the persisted "draft transcripts" store. No chrome/DOM here so
// it can be unit tested; the thin chrome.storage.local wrapper lives in
// panel/drafts.js.
//
// A draft: { id, createdAt, updatedAt, title, callMetadata, timeline, summary }
// The store is a plain object keyed by draft id.

// Each draft is stored under its own key (`draft_<id>`) so concurrent writes
// from multiple Meet tabs cannot clobber each other's drafts.
export const DRAFT_KEY_PREFIX = "draft_";

// Cleanup policy: drop drafts older than this, and keep at most this many.
export const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAX_DRAFTS = 10;

// A draft updated within this window is considered "live" (actively being
// written, e.g. recording in another tab) and is hidden from recovery.
export const RECOVERY_STALE_MS = 60 * 1000;

function draftTime(d) {
  return d.updatedAt ?? d.createdAt ?? 0;
}

export function upsertDraft(drafts, draft) {
  return { ...drafts, [draft.id]: draft };
}

export function removeDraft(drafts, id) {
  const next = { ...drafts };
  delete next[id];
  return next;
}

// Drop expired drafts and keep only the most recent `maxCount`.
export function pruneDrafts(
  drafts,
  { now = Date.now(), ttlMs = TTL_MS, maxCount = MAX_DRAFTS } = {},
) {
  const kept = Object.values(drafts || {})
    .filter((d) => now - draftTime(d) <= ttlMs)
    .sort((a, b) => draftTime(b) - draftTime(a))
    .slice(0, maxCount);

  const out = {};
  for (const d of kept) out[d.id] = d;
  return out;
}

// Drafts eligible to offer for recovery: not the current session, not actively
// being written, most recent first.
export function recoverableDrafts(
  drafts,
  { now = Date.now(), staleMs = RECOVERY_STALE_MS, excludeId = null } = {},
) {
  return Object.values(drafts || {})
    .filter((d) => d.id !== excludeId)
    .filter((d) => now - draftTime(d) >= staleMs)
    .sort((a, b) => draftTime(b) - draftTime(a));
}

// Thin chrome.storage.local wrapper around the pure transcript-store logic.
//
// Each draft lives under its own key (`draft_<id>`) instead of one shared
// object. This avoids the read-modify-write race where two Meet tabs writing
// the shared key would clobber each other's drafts.
import {
  DRAFT_KEY_PREFIX,
  pruneDrafts,
  recoverableDrafts,
} from "../shared/transcript-store.js";

const keyFor = (id) => DRAFT_KEY_PREFIX + id;

// Read every stored draft into an { id: draft } map.
async function readAllDrafts() {
  const all = await chrome.storage.local.get(null);
  const drafts = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(DRAFT_KEY_PREFIX) && v && v.id) drafts[v.id] = v;
  }
  return drafts;
}

// Upsert a single draft - a single-key write, so it never disturbs other drafts.
export async function saveDraft(draft) {
  await chrome.storage.local.set({ [keyFor(draft.id)]: draft });
}

export async function deleteDraft(id) {
  await chrome.storage.local.remove(keyFor(id));
}

// Prune (remove-only, so it never rewrites/clobbers surviving drafts) and
// return drafts to offer for recovery, excluding the current session.
export async function listRecoverableDrafts(excludeId) {
  const drafts = await readAllDrafts();
  const kept = pruneDrafts(drafts);

  const removedIds = Object.keys(drafts).filter((id) => !kept[id]);
  if (removedIds.length) {
    await chrome.storage.local.remove(removedIds.map(keyFor));
  }

  return recoverableDrafts(kept, { excludeId });
}

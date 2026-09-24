/**
 * autosave.js
 *
 * Storage-agnostic autosave: the caller injects a `storage` object with
 * `getItem`/`setItem`/`removeItem` (localStorage, sessionStorage, or a
 * Map-backed stub for tests/Node). Never throws: storage exceptions
 * (quota exceeded, SecurityError in a sandboxed iframe, ...) are caught
 * and turned into a `false`/`null` return value instead.
 */

const KEY_PREFIX = 'subtitle-timing-editor:v1:';

/**
 * Build the storage key for a given source SRT file.
 * @param {string} srtName
 * @param {number} srtSize
 * @returns {string}
 */
export function makeSaveKey(srtName, srtSize) {
  return `${KEY_PREFIX}${srtName || ''}:${srtSize ?? ''}`;
}

/**
 * Persist a full snapshot of the current editing session.
 * @param {{getItem:Function,setItem:Function,removeItem:Function}} storage
 * @param {string} key
 * @param {{cues:Array<object>, selectedId?:string|null, savedAt?:string}} data
 * @returns {boolean} true on success
 */
export function saveSnapshot(storage, key, { cues, selectedId = null, savedAt } = {}) {
  try {
    const payload = {
      version: 1,
      savedAt: savedAt || new Date().toISOString(),
      selectedId,
      cues: (cues || []).map((c) => ({
        id: c.id,
        start: c.start,
        end: c.end,
        text: c.text,
        needsReview: !!c.needsReview,
        origStart: c.origStart,
        origEnd: c.origEnd,
        origText: c.origText,
        added: !!c.added,
        split: !!c.split,
      })),
    };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a previously saved snapshot.
 * @param {{getItem:Function,setItem:Function,removeItem:Function}} storage
 * @param {string} key
 * @returns {{version:1, savedAt:string|null, selectedId:string|null, cues:Array<object>}
 *           |{version:'legacy', legacyPatches:Array<object>}
 *           |null}
 */
export function loadSnapshot(storage, key) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (data && data.version === 1 && Array.isArray(data.cues)) {
    // Backward compatibility: old-format per-cue rows with `deleted:true` are dropped.
    const cues = data.cues.filter((c) => c && !c.deleted).map((c) => ({ ...c }));
    return {
      version: 1,
      savedAt: data.savedAt || null,
      selectedId: data.selectedId ?? null,
      cues,
    };
  }

  if (Array.isArray(data)) {
    // Legacy format: an array of per-cue patches, some possibly `deleted:true`.
    return { version: 'legacy', legacyPatches: data.filter((p) => p && !p.deleted) };
  }

  return null;
}

/**
 * Apply legacy-format patches (`{i, start, end, text}` by array index) on
 * top of a base cue list, used to restore very old autosave data.
 * @param {Array<object>} baseCues
 * @param {Array<{i:number,start?:number,end?:number,text?:string}>} legacyPatches
 * @returns {Array<object>}
 */
export function restoreFromLegacy(baseCues, legacyPatches) {
  const byIndex = new Map();
  for (const p of legacyPatches || []) {
    if (p && typeof p.i === 'number') byIndex.set(p.i, p);
  }
  return baseCues.map((cue, i) => {
    const patch = byIndex.get(i);
    if (!patch) return cue;
    return {
      ...cue,
      start: patch.start !== undefined ? patch.start : cue.start,
      end: patch.end !== undefined ? patch.end : cue.end,
      text: patch.text !== undefined ? patch.text : cue.text,
    };
  });
}

/**
 * Remove a saved snapshot.
 * @param {{getItem:Function,setItem:Function,removeItem:Function}} storage
 * @param {string} key
 * @returns {boolean} true on success
 */
export function clearSnapshot(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

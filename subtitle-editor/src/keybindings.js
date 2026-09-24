/**
 * keybindings.js
 *
 * A data-driven shortcut table decoupled from real DOM `KeyboardEvent`s:
 * every function here accepts a plain object shaped like one
 * (`{code, key, ctrlKey, metaKey, altKey, shiftKey, isComposing}`), so it
 * can be tested and reused (e.g. from a Node script) without a browser.
 *
 * Ctrl and Meta (Cmd) are treated as the same modifier ("Ctrl") so the
 * same bindings work on Windows/Linux and macOS.
 */

/** All available actions, in a stable order, with Japanese UI labels. */
export const ACTIONS = [
  { id: 'playPause', label: '再生/一時停止' },
  { id: 'prevFrame', label: '前のフレーム' },
  { id: 'nextFrame', label: '次のフレーム' },
  { id: 'setIn', label: 'IN点を設定' },
  { id: 'setOut', label: 'OUT点を設定' },
  { id: 'confirmNext', label: '確定して次へ' },
  { id: 'prevCue', label: '前の字幕' },
  { id: 'nextCue', label: '次の字幕' },
  { id: 'nextReview', label: '次の要確認へ' },
  { id: 'playCue', label: 'この字幕を再生' },
  { id: 'split', label: '分割' },
  { id: 'addCue', label: '字幕を追加' },
  { id: 'deleteCue', label: '字幕を削除' },
  { id: 'undo', label: '元に戻す' },
  { id: 'redo', label: 'やり直す' },
  { id: 'save', label: '保存' },
  { id: 'exportAs', label: '名前を付けて書き出し' },
  { id: 'jumpBack1s', label: '1秒戻る' },
  { id: 'jumpFwd1s', label: '1秒進む' },
];

const ACTION_IDS = new Set(ACTIONS.map((a) => a.id));

/** Default key bindings: actionId -> up to 2 combo strings. */
export const DEFAULT_BINDINGS = Object.freeze({
  playPause: ['Space'],
  prevFrame: ['ArrowLeft'],
  nextFrame: ['ArrowRight'],
  setIn: ['KeyI'],
  setOut: ['KeyO'],
  confirmNext: ['Enter'],
  prevCue: ['ArrowUp'],
  nextCue: ['ArrowDown'],
  nextReview: ['KeyN'],
  playCue: ['KeyP'],
  split: ['Ctrl+KeyK'],
  addCue: ['KeyA'],
  deleteCue: ['Delete', 'Backspace'],
  undo: ['Ctrl+KeyZ'],
  redo: ['Ctrl+Shift+KeyZ', 'Ctrl+KeyY'],
  save: ['Ctrl+KeyS'],
  exportAs: [],
  jumpBack1s: ['Shift+ArrowLeft'],
  jumpFwd1s: ['Shift+ArrowRight'],
});

function cloneBindings(bindings) {
  const out = {};
  for (const [k, v] of Object.entries(bindings)) out[k] = Array.isArray(v) ? v.slice() : [];
  return out;
}

/**
 * Turn a key-event-like object into a canonical combo string, e.g.
 * "Ctrl+Shift+KeyZ". Ctrl and Meta are merged into "Ctrl".
 * @param {{code?:string, key?:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, shiftKey?:boolean}} evt
 * @returns {string}
 */
export function normalizeCombo(evt) {
  const parts = [];
  if (evt.ctrlKey || evt.metaKey) parts.push('Ctrl');
  if (evt.altKey) parts.push('Alt');
  if (evt.shiftKey) parts.push('Shift');
  const key = evt.code || evt.key || '';
  parts.push(key);
  return parts.join('+');
}

/**
 * Human-readable label for a combo string, e.g. "Ctrl+Shift+KeyZ" -> "Ctrl+Shift+Z".
 * @param {string} combo
 * @returns {string}
 */
export function comboLabel(combo) {
  if (!combo) return '';
  return combo
    .split('+')
    .map((part) => {
      if (part.startsWith('Key')) return part.slice(3);
      if (part.startsWith('Digit')) return part.slice(5);
      return part;
    })
    .join('+');
}

/**
 * @param {object} evt
 * @param {string} combo
 * @returns {boolean}
 */
export function matchKey(evt, combo) {
  return normalizeCombo(evt) === combo;
}

/**
 * Find which action (if any) a key event triggers.
 * @param {object} evt
 * @param {Record<string,string[]>} [bindings=DEFAULT_BINDINGS]
 * @param {{inTextInput?:boolean}} [opts]
 * @returns {string|null} the action id, or null
 */
export function findAction(evt, bindings = DEFAULT_BINDINGS, { inTextInput = false } = {}) {
  if (evt.isComposing) return null;
  const combo = normalizeCombo(evt);
  const hasModifier = combo.split('+').some((p) => p === 'Ctrl' || p === 'Alt');
  if (inTextInput && !hasModifier) return null;
  for (const [actionId, combos] of Object.entries(bindings)) {
    if (Array.isArray(combos) && combos.includes(combo)) return actionId;
  }
  return null;
}

/**
 * Assign `combo` to `actionId`'s slot (0 or 1). Fails with a conflict if
 * another action (or another slot) already uses that combo.
 * @param {Record<string,string[]>} bindings
 * @param {string} actionId
 * @param {number} slot 0 or 1 (max 2 keys per action)
 * @param {string} combo
 * @returns {{bindings:Record<string,string[]>}|{error:'conflict', conflictWith:string}}
 */
export function assign(bindings, actionId, slot, combo) {
  if (!ACTION_IDS.has(actionId)) throw new Error(`Unknown action: ${actionId}`);
  if (slot !== 0 && slot !== 1) throw new Error(`Invalid slot: ${slot}`);

  if (combo) {
    for (const [aid, combos] of Object.entries(bindings)) {
      const list = combos || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i] === combo && !(aid === actionId && i === slot)) {
          return { error: 'conflict', conflictWith: aid };
        }
      }
    }
  }

  const next = cloneBindings(bindings);
  const list = next[actionId] || [];
  list[slot] = combo;
  next[actionId] = list.slice(0, 2);
  return { bindings: next };
}

/**
 * Clear one slot of an action's binding.
 * @param {Record<string,string[]>} bindings
 * @param {string} actionId
 * @param {number} slot
 * @returns {Record<string,string[]>}
 */
export function clearBinding(bindings, actionId, slot) {
  const next = cloneBindings(bindings);
  if (next[actionId]) {
    next[actionId] = next[actionId].filter((_, i) => i !== slot);
  }
  return next;
}

/**
 * @returns {Record<string,string[]>} a fresh copy of the default bindings.
 */
export function resetBindings() {
  return cloneBindings(DEFAULT_BINDINGS);
}

/**
 * @param {Record<string,string[]>} bindings
 * @returns {string}
 */
export function serializeBindings(bindings) {
  return JSON.stringify(bindings);
}

/**
 * Parse a serialized bindings string, tolerating unknown actions or
 * garbage: any action missing or malformed falls back to its default.
 * @param {string} str
 * @returns {Record<string,string[]>}
 */
export function deserializeBindings(str) {
  let parsed;
  try {
    parsed = JSON.parse(str);
  } catch {
    return resetBindings();
  }
  if (!parsed || typeof parsed !== 'object') return resetBindings();

  const result = resetBindings();
  for (const action of ACTIONS) {
    const value = parsed[action.id];
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      result[action.id] = value.slice(0, 2);
    }
    // else: keep the default already in `result`
  }
  return result;
}

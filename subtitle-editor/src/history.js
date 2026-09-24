/**
 * history.js
 *
 * Generic, id-based undo/redo. Cue positions (array indices) are never
 * used as identity; everything is tracked and restored by stable cue id,
 * so undo/redo remain correct even though other operations may have
 * resorted the array in between.
 *
 * Entry shape
 * -----------
 *   { type, label, before: CueSnapshot[], after: CueSnapshot[], coalesceKey? }
 *
 * `before` holds a snapshot of every cue affected by the operation as it
 * was *before* the change; `after` holds the same cues as they are
 * *after* the change. The affected-id set is the union of ids appearing
 * in `before` and `after`:
 *   - id in `before` only  -> the operation deleted that cue.
 *   - id in `after` only   -> the operation created that cue.
 *   - id in both           -> the operation modified that cue.
 *
 * This single shape covers edits, moves, adds, deletes, splits (the
 * original cue's id becomes the "front" half) and bulk operations (many
 * ids modified in one entry) uniformly.
 */

import { sortCuesStable } from './cues.js';

/**
 * @param {{limit?:number}} [opts]
 */
export function createHistory({ limit = 500 } = {}) {
  let undoStack = [];
  let redoStack = [];

  return {
    /**
     * Push a new entry. If `coalesceKey` matches the top of the undo
     * stack's coalesceKey, the entries are merged (the earlier entry's
     * `before` is kept, its `after` replaced) instead of creating a new
     * step -- used for continuous typing in the same cue.
     * @param {object} entry
     * @param {{coalesceKey?:string}} [opts]
     */
    push(entry, { coalesceKey } = {}) {
      const top = undoStack[undoStack.length - 1];
      if (coalesceKey !== undefined && top && top.coalesceKey === coalesceKey) {
        top.after = entry.after;
        top.label = entry.label ?? top.label;
      } else {
        undoStack.push({ ...entry, coalesceKey });
        if (undoStack.length > limit) undoStack.shift();
      }
      redoStack = [];
    },
    /** @returns {object|null} the entry to apply, or null if nothing to undo */
    undo() {
      if (undoStack.length === 0) return null;
      const entry = undoStack.pop();
      redoStack.push(entry);
      return entry;
    },
    /** @returns {object|null} the entry to re-apply, or null if nothing to redo */
    redo() {
      if (redoStack.length === 0) return null;
      const entry = redoStack.pop();
      undoStack.push(entry);
      return entry;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    /** Discard both stacks (e.g. after loading a new file). */
    clear() {
      undoStack = [];
      redoStack = [];
    },
    /** Drop the most recently pushed entry without applying it (used by cancelEmptyAdd). */
    dropLast() {
      undoStack.pop();
    },
    /** Peek at the top of the undo stack without popping it. */
    peekUndo() {
      return undoStack.length ? undoStack[undoStack.length - 1] : null;
    },
    size() {
      return { undo: undoStack.length, redo: redoStack.length };
    },
  };
}

/**
 * Apply an entry's undo direction to a cues array, returning a NEW sorted
 * array. Pure function.
 * @param {Array<object>} cues
 * @param {object} entry
 * @returns {Array<object>}
 */
export function applyUndo(cues, entry) {
  return applyDirection(cues, entry.after, entry.before);
}

/**
 * Apply an entry's redo direction to a cues array, returning a NEW sorted
 * array. Pure function.
 * @param {Array<object>} cues
 * @param {object} entry
 * @returns {Array<object>}
 */
export function applyRedo(cues, entry) {
  return applyDirection(cues, entry.before, entry.after);
}

function applyDirection(cues, removeSideList, restoreSideList) {
  const restoreIds = new Set(restoreSideList.map((c) => c.id));
  let next = cues.filter((c) => restoreIds.has(c.id) || !removeSideList.some((r) => r.id === c.id));
  for (const snap of restoreSideList) {
    const i = next.findIndex((c) => c.id === snap.id);
    if (i === -1) next.push({ ...snap });
    else next[i] = { ...snap };
  }
  return sortCuesStable(next);
}

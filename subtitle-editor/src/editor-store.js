/**
 * editor-store.js
 *
 * The only stateful module in this library: a small facade that combines
 * cues.js, split.js, history.js and validate.js into a UI-friendly store
 * suitable for driving a subtitle editor's view layer. All mutating
 * methods go through the undo/redo history except where explicitly noted
 * (drag previews, cancelling an empty just-added cue).
 */

import {
  sortCuesStable,
  moveCue,
  trimCue,
  addCue,
  deleteCue,
  nextSelectionAfterDelete,
  renumber,
  pickFollowCue,
} from './cues.js';
import { splitCue } from './split.js';
import { createHistory, applyUndo, applyRedo } from './history.js';
import { serializeSrt } from './srt.js';

function defaultIdGen() {
  let n = 0;
  return () => `n${++n}`;
}

function snapshot(cue) {
  return { ...cue };
}

/**
 * @param {{cues?:Array<object>, fps?:number, duration?:number, idGen?:() => string}} [opts]
 */
export function createEditorStore({ cues = [], fps = 30, duration = Infinity, idGen } = {}) {
  const genId = idGen || defaultIdGen();
  let state = {
    cues: renumber(sortCuesStable(cues)),
    selectedId: cues.length ? sortCuesStable(cues)[0].id : null,
    fps,
    duration,
  };
  const history = createHistory({ limit: 500 });
  const listeners = new Set();
  let dragOrigin = null; // { id, snapshot }

  function getState() {
    return {
      cues: state.cues,
      selectedId: state.selectedId,
      fps: state.fps,
      duration: state.duration,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
    };
  }

  function notify(type) {
    const snap = getState();
    for (const fn of listeners) fn({ type, state: snap });
  }

  function findCue(id) {
    return state.cues.find((c) => c.id === id) || null;
  }

  function setCues(nextCues, { resort = true } = {}) {
    state.cues = resort ? renumber(sortCuesStable(nextCues)) : renumber(nextCues);
  }

  function pushEntry(type, label, before, after, opts) {
    history.push({ type, label, before, after }, opts);
  }

  function selectAffectedAfterHistoryOp(entry) {
    const affectedIds = new Set([...entry.before.map((c) => c.id), ...entry.after.map((c) => c.id)]);
    if (state.selectedId && findCue(state.selectedId)) return; // still valid, keep it
    for (const id of affectedIds) {
      if (findCue(id)) {
        state.selectedId = id;
        return;
      }
    }
    state.selectedId = state.cues.length ? state.cues[0].id : null;
  }

  const store = {
    getState,

    /** @param {(evt:{type:string, state:object}) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    select(id) {
      if (id !== null && !findCue(id)) return;
      state.selectedId = id;
      notify('select');
    },

    selectNext() {
      const i = state.cues.findIndex((c) => c.id === state.selectedId);
      if (state.cues.length === 0) return;
      const nextIndex = i === -1 ? 0 : Math.min(i + 1, state.cues.length - 1);
      state.selectedId = state.cues[nextIndex].id;
      notify('selectNext');
    },

    selectPrev() {
      const i = state.cues.findIndex((c) => c.id === state.selectedId);
      if (state.cues.length === 0) return;
      const prevIndex = i === -1 ? 0 : Math.max(i - 1, 0);
      state.selectedId = state.cues[prevIndex].id;
      notify('selectPrev');
    },

    selectNextNeedsReview() {
      if (state.cues.length === 0) return;
      const i = state.cues.findIndex((c) => c.id === state.selectedId);
      const n = state.cues.length;
      for (let step = 1; step <= n; step++) {
        const idx = (i + step) % n;
        if (state.cues[idx].needsReview) {
          state.selectedId = state.cues[idx].id;
          notify('selectNextNeedsReview');
          return;
        }
      }
    },

    setStart(id, t) {
      const cue = findCue(id);
      if (!cue) return;
      const before = snapshot(cue);
      const next = trimCue(state.cues, id, { start: t }, { fps: state.fps, duration: state.duration });
      setCues(next);
      const after = snapshot(findCue(id));
      pushEntry('edit', 'set start', [before], [after]);
      notify('setStart');
    },

    setEnd(id, t) {
      const cue = findCue(id);
      if (!cue) return;
      const before = snapshot(cue);
      const next = trimCue(state.cues, id, { end: t }, { fps: state.fps, duration: state.duration });
      setCues(next);
      const after = snapshot(findCue(id));
      pushEntry('edit', 'set end', [before], [after]);
      notify('setEnd');
    },

    setText(id, text, { coalesce = false } = {}) {
      const cue = findCue(id);
      if (!cue) return;
      const before = snapshot(cue);
      const nextCues = state.cues.map((c) => (c.id === id ? { ...c, text } : c));
      setCues(nextCues, { resort: false });
      const after = snapshot(findCue(id));
      pushEntry('edit', 'set text', [before], [after], coalesce ? { coalesceKey: `text:${id}` } : undefined);
      notify('setText');
    },

    move(id, delta) {
      const cue = findCue(id);
      if (!cue) return;
      const before = snapshot(cue);
      const next = moveCue(state.cues, id, delta, { fps: state.fps, duration: state.duration });
      setCues(next);
      const after = snapshot(findCue(id));
      pushEntry('move', 'move cue', [before], [after]);
      notify('move');
    },

    beginDrag(id) {
      const cue = findCue(id);
      if (!cue) return;
      dragOrigin = { id, snapshot: snapshot(cue) };
    },

    dragPreview(id, { start, end } = {}) {
      if (!dragOrigin || dragOrigin.id !== id) return;
      const next = trimCue(state.cues, id, { start, end }, { fps: state.fps, duration: state.duration });
      setCues(next, { resort: false });
      notify('dragPreview');
    },

    endDrag() {
      if (!dragOrigin) return;
      const { id, snapshot: before } = dragOrigin;
      dragOrigin = null;
      const cue = findCue(id);
      if (!cue) return;
      const after = snapshot(cue);
      setCues(state.cues, { resort: true });
      if (before.start !== after.start || before.end !== after.end) {
        pushEntry('move', 'drag cue', [before], [after]);
      }
      notify('endDrag');
    },

    cancelDrag() {
      if (!dragOrigin) return;
      const { id, snapshot: before } = dragOrigin;
      dragOrigin = null;
      const nextCues = state.cues.map((c) => (c.id === id ? { ...before } : c));
      setCues(nextCues, { resort: false });
      notify('cancelDrag');
    },

    add(at, { text = '' } = {}) {
      const { cues: next, id } = addCue(state.cues, {
        at,
        text,
        fps: state.fps,
        duration: state.duration,
        idGen: genId,
      });
      setCues(next, { resort: false }); // addCue already sorts+renumbers
      const after = snapshot(findCue(id));
      pushEntry('add', 'add cue', [], [after]);
      state.selectedId = id;
      notify('add');
      return id;
    },

    cancelEmptyAdd(id) {
      const cue = findCue(id);
      if (!cue || !cue.added || (cue.text || '').trim() !== '') return false;
      const top = history.peekUndo();
      if (top && top.type === 'add' && top.after.length === 1 && top.after[0].id === id) {
        history.dropLast();
        const { cues: next, removed, removedIndex } = deleteCue(state.cues, id);
        setCues(next, { resort: false });
        state.selectedId = removed ? nextSelectionAfterDelete(state.cues, removedIndex) : state.selectedId;
        notify('cancelEmptyAdd');
        return true;
      }
      return false;
    },

    delete(id) {
      const { cues: next, removed, removedIndex } = deleteCue(state.cues, id);
      if (!removed) return;
      setCues(next, { resort: false });
      pushEntry('delete', 'delete cue', [snapshot(removed)], []);
      state.selectedId = nextSelectionAfterDelete(state.cues, removedIndex);
      notify('delete');
    },

    split(id, { caret, playhead } = {}) {
      const cue = findCue(id);
      if (!cue) return null;
      const result = splitCue(cue, { caret, playhead, fps: state.fps, idGen: genId });
      if (!result) return null;
      const [front, back] = result;
      const nextCues = sortCuesStable(
        state.cues.map((c) => (c.id === id ? front : c)).concat([back])
      );
      setCues(nextCues, { resort: false });
      pushEntry('split', 'split cue', [snapshot(cue)], [snapshot(front), snapshot(back)]);
      state.selectedId = back.id;
      notify('split');
      return back.id;
    },

    undo() {
      const entry = history.undo();
      if (!entry) return false;
      setCues(applyUndo(state.cues, entry), { resort: false });
      selectAffectedAfterHistoryOp(entry);
      notify('undo');
      return true;
    },

    redo() {
      const entry = history.redo();
      if (!entry) return false;
      setCues(applyRedo(state.cues, entry), { resort: false });
      selectAffectedAfterHistoryOp(entry);
      notify('redo');
      return true;
    },

    canUndo() {
      return history.canUndo();
    },

    canRedo() {
      return history.canRedo();
    },

    revertToOriginal(id) {
      const cue = findCue(id);
      if (!cue) return false;
      if (cue.split || cue.added) return false;
      const before = snapshot(cue);
      const reverted = { ...cue, start: cue.origStart, end: cue.origEnd, text: cue.origText };
      const nextCues = state.cues.map((c) => (c.id === id ? reverted : c));
      setCues(nextCues);
      pushEntry('edit', 'revert cue', [before], [snapshot(reverted)]);
      notify('revertToOriginal');
      return true;
    },

    followPlayback(t, { editing = false } = {}) {
      if (editing) return;
      const found = pickFollowCue(state.cues, t, { fps: state.fps });
      if (found) {
        state.selectedId = found.id;
        notify('followPlayback');
      }
      // else: keep current selection
    },

    setNeedsReview(id, bool) {
      const cue = findCue(id);
      if (!cue) return;
      const before = snapshot(cue);
      const nextCues = state.cues.map((c) => (c.id === id ? { ...c, needsReview: !!bool } : c));
      setCues(nextCues, { resort: false });
      const after = snapshot(findCue(id));
      pushEntry('edit', 'toggle needs review', [before], [after]);
      notify('setNeedsReview');
    },

    toSrt(opts) {
      return serializeSrt(state.cues, opts);
    },

    load(newCues) {
      state.cues = renumber(sortCuesStable(newCues));
      state.selectedId = state.cues.length ? state.cues[0].id : null;
      history.clear();
      dragOrigin = null;
      notify('load');
    },
  };

  return store;
}

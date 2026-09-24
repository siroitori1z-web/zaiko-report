import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorStore } from '../src/editor-store.js';

function cue(id, start, end, text = '') {
  return { id, index: 0, start, end, text, needsReview: false, origStart: start, origEnd: end, origText: text };
}

function makeStore(overrides = {}) {
  let n = 0;
  return createEditorStore({
    cues: [cue('a', 0, 2, 'hello'), cue('b', 3, 5, 'world')],
    fps: 30,
    duration: 20,
    idGen: () => `new${++n}`,
    ...overrides,
  });
}

test('getState reflects initial cues sorted, first selected', () => {
  const store = makeStore();
  const s = store.getState();
  assert.equal(s.cues.length, 2);
  assert.equal(s.selectedId, 'a');
  assert.equal(s.canUndo, false);
});

test('subscribe receives notifications and can unsubscribe', () => {
  const store = makeStore();
  const events = [];
  const unsub = store.subscribe((e) => events.push(e.type));
  store.select('b');
  unsub();
  store.select('a');
  assert.deepEqual(events, ['select']);
});

test('setText + undo/redo', () => {
  const store = makeStore();
  store.setText('a', 'HELLO');
  assert.equal(store.getState().cues.find((c) => c.id === 'a').text, 'HELLO');
  store.undo();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').text, 'hello');
  store.redo();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').text, 'HELLO');
});

test('setText coalescing merges consecutive typing into a single undo step', () => {
  const store = makeStore();
  store.setText('a', 'h', { coalesce: true });
  store.setText('a', 'he', { coalesce: true });
  store.setText('a', 'hel', { coalesce: true });
  store.undo();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').text, 'hello');
  assert.equal(store.canRedo(), true);
});

test('add then delete then undo/undo restores original state; ids remain stable', () => {
  const store = makeStore();
  const id = store.add(10, { text: 'new cue' });
  assert.equal(store.getState().selectedId, id);
  assert.equal(store.getState().cues.length, 3);

  store.delete(id);
  assert.equal(store.getState().cues.length, 2);

  store.undo(); // undoes delete -> cue reappears
  assert.equal(store.getState().cues.length, 3);
  assert.ok(store.getState().cues.some((c) => c.id === id));

  store.undo(); // undoes add -> cue gone again
  assert.equal(store.getState().cues.length, 2);

  store.redo(); // redo add
  store.redo(); // redo delete
  assert.equal(store.getState().cues.length, 2);
});

test('delete selects per nextSelectionAfterDelete', () => {
  const store = makeStore({ cues: [cue('a', 0, 1), cue('b', 2, 3), cue('c', 4, 5)] });
  store.select('b');
  store.delete('b');
  assert.equal(store.getState().selectedId, 'c');
});

test('cancelEmptyAdd removes the cue AND drops the history entry entirely', () => {
  const store = makeStore();
  const id = store.add(10, { text: '' });
  assert.equal(store.getState().cues.length, 3);
  const cancelled = store.cancelEmptyAdd(id);
  assert.equal(cancelled, true);
  assert.equal(store.getState().cues.length, 2);
  assert.equal(store.canUndo(), false); // no trace left in history
});

test('cancelEmptyAdd is a no-op if the cue has text, or was not just added', () => {
  const store = makeStore();
  const id = store.add(10, { text: 'not empty' });
  assert.equal(store.cancelEmptyAdd(id), false);
  assert.equal(store.getState().cues.length, 3);

  assert.equal(store.cancelEmptyAdd('a'), false); // 'a' was never added
});

test('split selects the back half; undo restores the single original cue', () => {
  const store = makeStore({ cues: [cue('a', 0, 4, 'ABCDEFGH')] });
  const backId = store.split('a', { playhead: 2 });
  assert.ok(backId);
  assert.equal(store.getState().selectedId, backId);
  assert.equal(store.getState().cues.length, 2);

  store.undo();
  assert.equal(store.getState().cues.length, 1);
  assert.equal(store.getState().cues[0].id, 'a');
  assert.equal(store.getState().cues[0].text, 'ABCDEFGH');
});

test('drag: beginDrag/dragPreview/endDrag creates one history entry; cancelDrag restores', () => {
  const store = makeStore();
  store.beginDrag('a');
  store.dragPreview('a', { start: 0.5, end: 2.5 });
  store.dragPreview('a', { start: 1, end: 3 });
  store.endDrag();
  const cueA = store.getState().cues.find((c) => c.id === 'a');
  assert.ok(Math.abs(cueA.start - 1) < 0.05);
  assert.equal(store.getState().canUndo, true);

  // Exactly one undo step for the whole drag.
  store.undo();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').start, 0);
  assert.equal(store.canUndo(), false);
});

test('cancelDrag restores the pre-drag value with no history entry', () => {
  const store = makeStore();
  store.beginDrag('a');
  store.dragPreview('a', { start: 1, end: 3 });
  store.cancelDrag();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').start, 0);
  assert.equal(store.canUndo(), false);
});

test('sort stability: moving a cue past another keeps selection on the same id', () => {
  const store = makeStore({ cues: [cue('a', 0, 1), cue('b', 2, 3), cue('c', 4, 5)] });
  store.select('c');
  store.setStart('c', 0.5); // 'c' now sorts before 'b'
  const s = store.getState();
  assert.equal(s.selectedId, 'c');
  assert.equal(s.cues[1].id, 'c');
});

test('revertToOriginal works for a plain edited cue, but not for split/added cues', () => {
  const store = makeStore();
  store.setText('a', 'changed');
  assert.equal(store.revertToOriginal('a'), true);
  assert.equal(store.getState().cues.find((c) => c.id === 'a').text, 'hello');

  const id = store.add(10, { text: 'x' });
  assert.equal(store.revertToOriginal(id), false);

  const storeSplit = makeStore({ cues: [cue('a', 0, 4, 'ABCDEFGH')] });
  const backId = storeSplit.split('a', { playhead: 2 });
  assert.equal(storeSplit.revertToOriginal('a'), false);
  assert.equal(storeSplit.revertToOriginal(backId), false);
});

test('followPlayback selects the active cue unless editing, and keeps selection when none active', () => {
  const store = makeStore();
  store.select('a');
  store.followPlayback(4, { editing: false }); // time 4 is inside cue 'b'
  assert.equal(store.getState().selectedId, 'b');

  store.followPlayback(2.5, { editing: false }); // no cue active there
  assert.equal(store.getState().selectedId, 'b'); // unchanged

  store.followPlayback(0.5, { editing: true }); // editing: ignored even though 'a' is active
  assert.equal(store.getState().selectedId, 'b');
});

test('setNeedsReview is undoable', () => {
  const store = makeStore();
  store.setNeedsReview('a', true);
  assert.equal(store.getState().cues.find((c) => c.id === 'a').needsReview, true);
  store.undo();
  assert.equal(store.getState().cues.find((c) => c.id === 'a').needsReview, false);
});

test('toSrt delegates to serializeSrt', () => {
  const store = makeStore();
  const srt = store.toSrt();
  assert.ok(srt.includes('hello'));
  assert.ok(srt.includes('world'));
});

test('load resets cues, selection and history', () => {
  const store = makeStore();
  store.setText('a', 'x');
  store.load([cue('z', 0, 1, 'fresh')]);
  const s = store.getState();
  assert.equal(s.cues.length, 1);
  assert.equal(s.selectedId, 'z');
  assert.equal(s.canUndo, false);
  assert.equal(s.canRedo, false);
});

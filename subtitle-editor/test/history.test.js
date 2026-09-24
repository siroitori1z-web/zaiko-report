import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, applyUndo, applyRedo } from '../src/history.js';

function cue(id, start, end, text = '') {
  return { id, index: 0, start, end, text };
}

test('createHistory: undo/redo basic edit entry', () => {
  const h = createHistory();
  let cues = [cue('a', 0, 1, 'hi')];
  const before = { ...cues[0] };
  cues = [{ ...cues[0], text: 'bye' }];
  const after = { ...cues[0] };
  h.push({ type: 'edit', label: 'text', before: [before], after: [after] });

  assert.equal(h.canUndo(), true);
  assert.equal(h.canRedo(), false);

  const entry = h.undo();
  cues = applyUndo(cues, entry);
  assert.equal(cues[0].text, 'hi');
  assert.equal(h.canRedo(), true);

  const redoEntry = h.redo();
  cues = applyRedo(cues, redoEntry);
  assert.equal(cues[0].text, 'bye');
});

test('add: undo removes the created cue, redo restores it', () => {
  const h = createHistory();
  let cues = [cue('a', 0, 1)];
  const newCue = cue('b', 2, 3);
  cues = [...cues, newCue];
  h.push({ type: 'add', label: 'add', before: [], after: [newCue] });

  cues = applyUndo(cues, h.undo());
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, 'a');

  cues = applyRedo(cues, h.redo());
  assert.equal(cues.length, 2);
  assert.ok(cues.some((c) => c.id === 'b'));
});

test('delete: undo re-inserts the removed cue (sorted position), redo removes it again', () => {
  const h = createHistory();
  const removed = cue('b', 2, 3);
  let cues = [cue('a', 0, 1)];
  h.push({ type: 'delete', label: 'delete', before: [removed], after: [] });

  cues = applyUndo(cues, h.undo());
  assert.equal(cues.length, 2);
  assert.equal(cues[1].id, 'b'); // re-inserted in sorted (start) order

  cues = applyRedo(cues, h.redo());
  assert.equal(cues.length, 1);
});

test('split: undo restores the single original cue, redo re-splits', () => {
  const h = createHistory();
  const original = cue('a', 0, 4, 'ABCDEFGH');
  const front = cue('a', 0, 2, 'ABCD');
  const back = cue('b', 2, 4, 'EFGH');
  let cues = [front, back];
  h.push({ type: 'split', label: 'split', before: [original], after: [front, back] });

  cues = applyUndo(cues, h.undo());
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, 'a');
  assert.equal(cues[0].text, 'ABCDEFGH');

  cues = applyRedo(cues, h.redo());
  assert.equal(cues.length, 2);
  assert.ok(cues.some((c) => c.id === 'b'));
});

test('bulk entries touch several ids at once', () => {
  const h = createHistory();
  let cues = [cue('a', 0, 1), cue('b', 1, 2), cue('c', 2, 3)];
  const before = cues.map((c) => ({ ...c }));
  cues = cues.map((c) => ({ ...c, start: c.start + 1, end: c.end + 1 }));
  const after = cues.map((c) => ({ ...c }));
  h.push({ type: 'bulk', label: 'shift all', before, after });

  cues = applyUndo(cues, h.undo());
  assert.deepEqual(cues.map((c) => c.start), [0, 1, 2]);

  cues = applyRedo(cues, h.redo());
  assert.deepEqual(cues.map((c) => c.start), [1, 2, 3]);
});

test('coalescing: consecutive pushes with the same coalesceKey merge into one undo step', () => {
  const h = createHistory();
  let cues = [cue('a', 0, 1, '')];
  const before0 = { ...cues[0] };

  cues = [{ ...cues[0], text: 'h' }];
  h.push({ type: 'edit', label: 'type', before: [before0], after: [{ ...cues[0] }] }, { coalesceKey: 'text:a' });

  const beforeMid = { ...cues[0] };
  cues = [{ ...cues[0], text: 'hi' }];
  h.push({ type: 'edit', label: 'type', before: [beforeMid], after: [{ ...cues[0] }] }, { coalesceKey: 'text:a' });

  cues = [{ ...cues[0], text: 'hi!' }];
  h.push({ type: 'edit', label: 'type', before: [beforeMid], after: [{ ...cues[0] }] }, { coalesceKey: 'text:a' });

  assert.equal(h.size().undo, 1); // three pushes coalesced into one entry

  cues = applyUndo(cues, h.undo());
  assert.equal(cues[0].text, ''); // back to the very first "before"
});

test('a push with a different coalesceKey starts a new entry', () => {
  const h = createHistory();
  h.push({ type: 'edit', label: 'a', before: [cue('a', 0, 1)], after: [cue('a', 0, 1, 'x')] }, { coalesceKey: 'text:a' });
  h.push({ type: 'edit', label: 'b', before: [cue('b', 0, 1)], after: [cue('b', 0, 1, 'y')] }, { coalesceKey: 'text:b' });
  assert.equal(h.size().undo, 2);
});

test('pushing a new (non-coalesced) entry clears the redo stack', () => {
  const h = createHistory();
  h.push({ type: 'edit', label: 'a', before: [cue('a', 0, 1)], after: [cue('a', 0, 1, 'x')] });
  h.undo();
  assert.equal(h.canRedo(), true);
  h.push({ type: 'edit', label: 'b', before: [cue('b', 0, 1)], after: [cue('b', 0, 1, 'y')] });
  assert.equal(h.canRedo(), false);
});

test('limit: oldest entries are dropped once the limit is exceeded', () => {
  const h = createHistory({ limit: 3 });
  for (let i = 0; i < 5; i++) {
    h.push({ type: 'edit', label: `${i}`, before: [cue('a', 0, 1, `${i}`)], after: [cue('a', 0, 1, `${i + 1}`)] });
  }
  let undone = 0;
  while (h.canUndo()) {
    h.undo();
    undone++;
  }
  assert.equal(undone, 3);
});

test('undo()/redo() return null when there is nothing to do', () => {
  const h = createHistory();
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), null);
});

test('clear() empties both stacks', () => {
  const h = createHistory();
  h.push({ type: 'edit', label: 'a', before: [cue('a', 0, 1)], after: [cue('a', 0, 1, 'x')] });
  h.undo();
  h.clear();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});

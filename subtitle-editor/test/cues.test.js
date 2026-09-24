import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortCuesStable,
  isSorted,
  moveCue,
  trimCue,
  addCue,
  deleteCue,
  nextSelectionAfterDelete,
  renumber,
  activeCuesAt,
  pickFollowCue,
  shiftAll,
  isModified,
} from '../src/cues.js';

function cue(id, start, end, text = '') {
  return { id, index: 0, start, end, text, needsReview: false, origStart: start, origEnd: end, origText: text };
}

test('sortCuesStable: sorts by start, ties keep original order, does not mutate', () => {
  const input = [cue('b', 2, 3), cue('a', 1, 2), cue('c', 1, 2)];
  const sorted = sortCuesStable(input);
  assert.deepEqual(sorted.map((c) => c.id), ['a', 'c', 'b']);
  assert.equal(input[0].id, 'b'); // original untouched
});

test('isSorted', () => {
  assert.equal(isSorted([cue('a', 1, 2), cue('b', 2, 3)]), true);
  assert.equal(isSorted([cue('a', 2, 3), cue('b', 1, 2)]), false);
});

test('moveCue: keeps length, snaps, clamps into [0,duration]', () => {
  const cues = [cue('a', 1, 3)];
  const moved = moveCue(cues, 'a', 5, { fps: 30, duration: 10 });
  const a = moved[0];
  assert.equal(a.end - a.start, 2);
  assert.ok(a.start <= 8); // clamped so end <= duration
  const movedNeg = moveCue(cues, 'a', -100, { fps: 30, duration: 10 });
  assert.equal(movedNeg[0].start, 0);
});

test('trimCue: snaps and clamps, end<start collapses to zero length (no swap)', () => {
  const cues = [cue('a', 2, 5)];
  const trimmed = trimCue(cues, 'a', { end: 1 }, { fps: 30, duration: 10 });
  assert.equal(trimmed[0].start, 2);
  assert.equal(trimmed[0].end, 2); // collapsed, not swapped
});

test('trimCue: no-op for unknown id', () => {
  const cues = [cue('a', 2, 5)];
  const result = trimCue(cues, 'zzz', { end: 1 }, { fps: 30, duration: 10 });
  assert.equal(result, cues);
});

test('addCue: inserts at sorted position, flagged added:true', () => {
  const cues = [cue('a', 0, 1), cue('b', 5, 6)];
  const { cues: next, id } = addCue(cues, { at: 2, length: 1, fps: 30, duration: 10, idGen: () => 'new1' });
  assert.equal(id, 'new1');
  const idx = next.findIndex((c) => c.id === 'new1');
  assert.equal(idx, 1);
  assert.equal(next[idx].added, true);
  assert.deepEqual(next.map((c) => c.index), [1, 2, 3]);
});

test('addCue: end clamped to duration', () => {
  const { cues: next } = addCue([], { at: 9, length: 5, fps: 30, duration: 10, idGen: () => 'n' });
  assert.equal(next[0].end, 10);
});

test('deleteCue + nextSelectionAfterDelete: middle removal selects same position', () => {
  const cues = [cue('a', 0, 1), cue('b', 2, 3), cue('c', 4, 5)];
  const { cues: next, removed, removedIndex } = deleteCue(cues, 'b');
  assert.equal(removed.id, 'b');
  assert.equal(removedIndex, 1);
  const sel = nextSelectionAfterDelete(next, removedIndex);
  assert.equal(sel, 'c'); // same position now holds 'c'
});

test('nextSelectionAfterDelete: last item removal selects previous', () => {
  const remaining = [cue('a', 0, 1), cue('b', 2, 3)];
  const sel = nextSelectionAfterDelete(remaining, 2); // removed was last index
  assert.equal(sel, 'b');
});

test('nextSelectionAfterDelete: empty list selects null', () => {
  assert.equal(nextSelectionAfterDelete([], 0), null);
});

test('deleteCue: unknown id is a no-op', () => {
  const cues = [cue('a', 0, 1)];
  const result = deleteCue(cues, 'zzz');
  assert.equal(result.removed, null);
  assert.equal(result.removedIndex, -1);
});

test('renumber: sets 1..N', () => {
  const cues = [cue('a', 0, 1), cue('b', 1, 2)];
  cues[0].index = 9;
  cues[1].index = 9;
  const renumbered = renumber(cues);
  assert.deepEqual(renumbered.map((c) => c.index), [1, 2]);
});

test('activeCuesAt: startFrame <= f < endFrame', () => {
  const cues = [cue('a', 0, 1)]; // frames 0..30 at 30fps
  assert.deepEqual(activeCuesAt(cues, 0, { fps: 30 }), [0]);
  assert.deepEqual(activeCuesAt(cues, 29 / 30, { fps: 30 }), [0]); // last frame of the cue (frame 29)
  assert.deepEqual(activeCuesAt(cues, 1.0, { fps: 30 }), []); // end frame excluded
});

test('pickFollowCue: picks latest-start among active, null if none', () => {
  const cues = [cue('a', 0, 5), cue('b', 2, 5)];
  const picked = pickFollowCue(cues, 3, { fps: 30 });
  assert.equal(picked.id, 'b');
  assert.equal(pickFollowCue(cues, 10, { fps: 30 }), null);
});

test('shiftAll: shifts all cues, or only those from a given time', () => {
  const cues = [cue('a', 0, 1), cue('b', 5, 6)];
  const shifted = shiftAll(cues, 1, { fps: 30 });
  assert.equal(shifted[0].start, 1);
  assert.equal(shifted[1].start, 6);

  const partial = shiftAll(cues, 1, { fps: 30, from: 5 });
  assert.equal(partial[0].start, 0); // unaffected
  assert.equal(partial[1].start, 6);
});

test('isModified compares against orig* fields', () => {
  const c = cue('a', 1, 2, 'hi');
  assert.equal(isModified(c), false);
  assert.equal(isModified({ ...c, text: 'bye' }), true);
});

test('cues.js functions never mutate their input arrays', () => {
  const cues = [cue('a', 0, 1), cue('b', 2, 3)];
  const snapshot = JSON.stringify(cues);
  moveCue(cues, 'a', 1, { fps: 30, duration: 10 });
  trimCue(cues, 'b', { end: 2.5 }, { fps: 30, duration: 10 });
  addCue(cues, { at: 5, fps: 30, duration: 10, idGen: () => 'x' });
  deleteCue(cues, 'a');
  assert.equal(JSON.stringify(cues), snapshot);
});

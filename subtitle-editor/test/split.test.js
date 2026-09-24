import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCue } from '../src/split.js';

function cue(id, start, end, text) {
  return { id, index: 1, start, end, text, needsReview: false, origStart: start, origEnd: end, origText: text };
}

test('splitCue: too-short cue (< 2 frames) returns null', () => {
  const c = cue('a', 0, 1 / 30, 'x'); // 1 frame at 30fps
  assert.equal(splitCue(c, { fps: 30, idGen: () => 'b' }), null);
});

test('splitCue: no caret, no playhead -> splits at midpoint', () => {
  const c = cue('a', 0, 2, 'ABCDEFGHIJ');
  const [front, back] = splitCue(c, { fps: 30, idGen: () => 'b' });
  assert.equal(front.id, 'a');
  assert.equal(back.id, 'b');
  assert.ok(Math.abs(front.end - 1) < 0.05);
  assert.equal(front.end, back.start);
  assert.equal(front.text + back.text, 'ABCDEFGHIJ'.replace(/\s/g, ''));
});

test('splitCue: playhead inside cue is used as the split time', () => {
  const c = cue('a', 0, 4, 'ABCDEFGHIJKLMNOP');
  const [front, back] = splitCue(c, { playhead: 3, fps: 30, idGen: () => 'b' });
  assert.ok(Math.abs(front.end - 3) < 0.05);
  assert.equal(front.end, back.start);
});

test('splitCue: playhead outside cue is ignored, falls back to midpoint', () => {
  const c = cue('a', 0, 2, 'ABCDEFGH');
  const [front] = splitCue(c, { playhead: 100, fps: 30, idGen: () => 'b' });
  assert.ok(Math.abs(front.end - 1) < 0.05);
});

test('splitCue: caret given -> text splits at caret, time uses caret ratio when no playhead', () => {
  const c = cue('a', 0, 4, 'ABCDEFGHIJ'); // 10 chars, caret=5 -> ratio 0.5 -> time=2
  const [front, back] = splitCue(c, { caret: 5, fps: 30, idGen: () => 'b' });
  assert.equal(front.text, 'ABCDE');
  assert.equal(back.text, 'FGHIJ');
  assert.ok(Math.abs(front.end - 2) < 0.05);
});

test('splitCue: caret + playhead inside cue -> time from playhead, text from caret', () => {
  const c = cue('a', 0, 4, 'ABCDEFGHIJ');
  const [front, back] = splitCue(c, { caret: 2, playhead: 3, fps: 30, idGen: () => 'b' });
  assert.equal(front.text, 'AB');
  assert.equal(back.text, 'CDEFGHIJ');
  assert.ok(Math.abs(front.end - 3) < 0.05);
});

test('splitCue: prefers splitting right after punctuation/space near the proportional position', () => {
  // 20 chars, midpoint index=10. A comma sits at index 8 (so split-after index 9) which is
  // within the +/-30% window (window=6, so indices 4..16 checked).
  const text = 'ABCDEFGH,IJKLMNOPQRST'; // length 21, comma at index 8
  const c = cue('a', 0, 2, text);
  const [front, back] = splitCue(c, { fps: 30, idGen: () => 'b' });
  assert.equal(front.text, 'ABCDEFGH,');
  assert.equal(back.text, 'IJKLMNOPQRST');
});

test('splitCue: never splits inside a surrogate pair', () => {
  const emoji = '\u{1F600}'; // single surrogate-pair character
  const text = `AB${emoji}CD`; // proportional midpoint likely lands inside the pair
  const c = cue('a', 0, 2, text);
  const [front, back] = splitCue(c, { fps: 30, idGen: () => 'b' });
  // Reconstituted text must still contain the whole emoji intact somewhere.
  assert.ok((front.text + back.text).includes(emoji));
  // Neither half ends/starts with a lone surrogate half.
  const lastCodeOfFront = front.text.length ? front.text.charCodeAt(front.text.length - 1) : 0;
  assert.ok(!(lastCodeOfFront >= 0xd800 && lastCodeOfFront <= 0xdbff));
});

test('splitCue: guarantees >=1 frame on each side even with an early/late playhead', () => {
  const c = cue('a', 0, 2 / 30, 'AB'); // exactly 2 frames
  const [front, back] = splitCue(c, { playhead: 0.0001, fps: 30, idGen: () => 'b' });
  const frontFrames = Math.round((front.end - front.start) * 30);
  const backFrames = Math.round((back.end - back.start) * 30);
  assert.equal(frontFrames, 1);
  assert.equal(backFrames, 1);
});

test('splitCue: back inherits needsReview, both flagged split:true, front keeps id', () => {
  const c = { ...cue('a', 0, 2, 'ABCDEFGH'), needsReview: true };
  const [front, back] = splitCue(c, { fps: 30, idGen: () => 'b' });
  assert.equal(front.id, 'a');
  assert.equal(front.split, true);
  assert.equal(back.split, true);
  assert.equal(back.needsReview, true);
});

test('splitCue: trims whitespace on both sides', () => {
  const c = cue('a', 0, 2, 'hello   world');
  const [front, back] = splitCue(c, { caret: 8, fps: 30, idGen: () => 'b' });
  assert.equal(front.text, front.text.trim());
  assert.equal(back.text, back.text.trim());
});

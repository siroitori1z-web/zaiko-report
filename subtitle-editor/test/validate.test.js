import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCues, checkVideoPairing, finalizeCheck } from '../src/validate.js';

function cue(id, index, start, end, text = 'x', needsReview = false) {
  return { id, index, start, end, text, needsReview };
}

test('END_BEFORE_START is an error', () => {
  const issues = validateCues([cue('a', 1, 2, 1)], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'END_BEFORE_START' && i.level === 'error'));
});

test('ZERO_LENGTH is a warning', () => {
  const issues = validateCues([cue('a', 1, 1, 1)], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'ZERO_LENGTH' && i.level === 'warn'));
});

test('TOO_SHORT warns for a positive-length cue under 0.5s', () => {
  const issues = validateCues([cue('a', 1, 1, 1.3)], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'TOO_SHORT'));
});

test('NEGATIVE_START is an error', () => {
  const issues = validateCues([cue('a', 1, -1, 1)], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'NEGATIVE_START' && i.level === 'error'));
});

test('EMPTY_TEXT warns for blank/whitespace-only text', () => {
  const issues = validateCues([cue('a', 1, 0, 1, '   ')], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'EMPTY_TEXT'));
});

test('BEYOND_DURATION warns when a cue ends after the video duration', () => {
  const issues = validateCues([cue('a', 1, 5, 15)], { fps: 30, duration: 10 });
  assert.ok(issues.some((i) => i.code === 'BEYOND_DURATION'));
});

test('NEEDS_REVIEW surfaces as a warning', () => {
  const issues = validateCues([cue('a', 1, 0, 1, 'x', true)], { fps: 30, duration: 100 });
  assert.ok(issues.some((i) => i.code === 'NEEDS_REVIEW'));
});

test('OVERLAP includes seconds and a Japanese message naming both cues', () => {
  const cues = [cue('a', 14, 0, 5), cue('b', 15, 4, 8)];
  const issues = validateCues(cues, { fps: 30, duration: 100 });
  const overlap = issues.find((i) => i.code === 'OVERLAP');
  assert.ok(overlap);
  assert.ok(overlap.message.includes('#14'));
  assert.ok(overlap.message.includes('1.00秒重なっています'));
});

test('checkVideoPairing: warns when the last cue ends after duration', () => {
  const cues = [cue('a', 1, 0, 5), cue('b', 2, 90, 130)];
  const warnings = checkVideoPairing(cues, 120, { tailSec: 15 });
  assert.ok(warnings.some((w) => w.code === 'LAST_CUE_BEYOND_DURATION'));
});

test('checkVideoPairing: warns when there is no cue in the final tailSec seconds', () => {
  const cues = [cue('a', 1, 0, 5), cue('b', 2, 10, 20)];
  const warnings = checkVideoPairing(cues, 120, { tailSec: 15 });
  assert.ok(warnings.some((w) => w.code === 'NO_CUE_IN_TAIL'));
});

test('checkVideoPairing: no warnings for a well-paired file', () => {
  const cues = [cue('a', 1, 0, 5), cue('b', 2, 110, 118)];
  const warnings = checkVideoPairing(cues, 120, { tailSec: 15 });
  assert.equal(warnings.length, 0);
});

test('finalizeCheck: ok=false when there are errors; emptyIds lists EMPTY_TEXT cues', () => {
  const cues = [cue('a', 1, 5, 1), cue('b', 2, 10, 12, '')];
  const result = finalizeCheck(cues, { fps: 30, duration: 100 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 1);
  assert.deepEqual(result.emptyIds, ['b']);
});

test('finalizeCheck: ok=true with only warnings', () => {
  const cues = [cue('a', 1, 0, 5, 'ok text')];
  const result = finalizeCheck(cues, { fps: 30, duration: 100 });
  assert.equal(result.ok, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSegments,
  segmentsFromSilenceJson,
  sourceToSequence,
  sequenceToSource,
  mapCuesToSequence,
  sequenceDuration,
} from '../src/sequence-map.js';

test('buildSegments: outward rounding + sequence offsets with no gaps', () => {
  const segs = buildSegments(
    [
      { start: 1.0, end: 3.0 },
      { start: 10.0, end: 12.0 },
    ],
    { fps: 30 }
  );
  assert.equal(segs.length, 2);
  assert.equal(segs[0].srcIn, 30);
  assert.equal(segs[0].srcOut, 90);
  assert.equal(segs[0].seqIn, 0);
  assert.equal(segs[0].seqOut, 60);
  assert.equal(segs[1].seqIn, 60); // concatenated with no gap
  assert.equal(segs[1].seqOut, 120);
});

test('buildSegments: merges overlapping/adjacent segments', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 1.9, end: 4 }, // overlaps the first
    ],
    { fps: 30, mergeOverlapping: true }
  );
  assert.equal(segs.length, 1);
  assert.equal(segs[0].srcOut, 120); // frame for 4.0s
});

test('buildSegments: accepts start_frame/end_frame directly', () => {
  const segs = buildSegments([{ start_frame: 10, end_frame: 40 }], { fps: 30 });
  assert.equal(segs[0].srcIn, 10);
  assert.equal(segs[0].srcOut, 40);
});

test('sourceToSequence: inside a kept segment maps 1:1 with offset', () => {
  const segs = buildSegments([{ start: 1, end: 3 }], { fps: 30 });
  const r = sourceToSequence(1.5, segs, { fps: 30 });
  assert.equal(r.clamped, false);
  assert.ok(Math.abs(r.time - 0.5) < 1e-9);
});

test('sourceToSequence: falls in a cut gap -> clamps to nearer edge', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 1 },
      { start: 10, end: 11 },
    ],
    { fps: 30 }
  );
  // gap is [1,10]; 2 is much closer to the start (1) than to 10
  const nearStart = sourceToSequence(2, segs, { fps: 30 });
  assert.equal(nearStart.clamped, true);
  assert.equal(nearStart.direction, 'backward');

  const nearEnd = sourceToSequence(9, segs, { fps: 30 });
  assert.equal(nearEnd.clamped, true);
  assert.equal(nearEnd.direction, 'forward');

  // Regression: in sequence time a gap is a single point -- both ends of
  // the gap (regardless of which was "nearer" for the warning direction)
  // must resolve to the exact same cut-point frame, which is where the
  // two segments meet (segs[0].seqOut === segs[1].seqIn).
  assert.equal(segs[0].seqOut, segs[1].seqIn);
  assert.equal(nearStart.frame, segs[1].seqIn);
  assert.equal(nearEnd.frame, segs[1].seqIn);
});

test('sourceToSequence: before the first / after the last segment clamps to the ends', () => {
  const segs = buildSegments([{ start: 5, end: 6 }], { fps: 30 });
  const before = sourceToSequence(0, segs, { fps: 30 });
  assert.equal(before.clamped, true);
  assert.equal(before.direction, 'forward');
  assert.equal(before.frame, segs[0].seqIn);

  const after = sourceToSequence(100, segs, { fps: 30 });
  assert.equal(after.clamped, true);
  assert.equal(after.direction, 'backward');
});

test('sourceToSequence: a time exactly at a segment out-boundary belongs to that segment (regression)', () => {
  // Reported repro: buildSegments([{0,2},{5,7}]) -> seg0=[0,60]->[0,60], seg1=[150,210]->[60,120]
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    { fps: 30 }
  );
  // t=7 is exactly seg1.srcOut (within epsilon) -> must land ON seg1, at its
  // seqOut, not be treated as "in the gap after seg1" / off by one frame.
  const r = sourceToSequence(7, segs, { fps: 30 });
  assert.equal(r.clamped, false);
  assert.equal(r.direction, 'none');
  assert.equal(r.frame, segs[1].seqOut);
  assert.ok(Math.abs(r.time - 4.0) < 1e-9);

  // Same rule for a non-final segment's out-boundary (t=2 is seg0.srcOut).
  const r0 = sourceToSequence(2, segs, { fps: 30 });
  assert.equal(r0.clamped, false);
  assert.equal(r0.frame, segs[0].seqOut);
});

test('sourceToSequence: beyond the last segment maps exactly to sequenceDuration, not one frame short (regression)', () => {
  const segs = buildSegments([{ start: 0, end: 2 }], { fps: 30 });
  const r = sourceToSequence(100, segs, { fps: 30 });
  assert.equal(r.clamped, true);
  assert.equal(r.direction, 'backward');
  assert.equal(r.frame, segs[0].seqOut);
  assert.ok(Math.abs(r.time - sequenceDuration(segs, 30)) < 1e-9);
});

test('sourceToSequence: clamp=false throws inside a cut gap', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 1 },
      { start: 10, end: 11 },
    ],
    { fps: 30 }
  );
  assert.throws(() => sourceToSequence(5, segs, { fps: 30, clamp: false }));
});

test('sequenceToSource is the inverse of sourceToSequence inside kept segments', () => {
  const segs = buildSegments(
    [
      { start: 1, end: 3 },
      { start: 10, end: 12 },
    ],
    { fps: 30 }
  );
  for (const t of [1.2, 2.9, 10.5]) {
    const seq = sourceToSequence(t, segs, { fps: 30 });
    const back = sequenceToSource(seq.time, segs, { fps: 30 });
    assert.ok(Math.abs(back.time - t) < 1 / 30 + 1e-9);
  }
});

test('sequenceToSource clamps out-of-range sequence time to the ends', () => {
  const segs = buildSegments([{ start: 1, end: 3 }], { fps: 30 });
  const r = sequenceToSource(1000, segs, { fps: 30 });
  assert.equal(r.clamped, true);
});

test('sequenceToSource: boundary symmetry (documented convention)', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    { fps: 30 }
  );
  // A sequence time exactly at the cut point resolves to the START of the
  // NEXT segment in source time (documented convention), not the end of
  // the previous one.
  const cutFrame = segs[0].seqOut; // === segs[1].seqIn
  const atCut = sequenceToSource(frameToTimeHelper(cutFrame), segs, { fps: 30 });
  assert.equal(atCut.frame, segs[1].srcIn);

  // The true end of the whole sequence maps to the true end of the last
  // kept segment (symmetric with sourceToSequence's boundary rule), not
  // one frame short of it.
  const atEnd = sequenceToSource(sequenceDuration(segs, 30), segs, { fps: 30 });
  assert.equal(atEnd.frame, segs[segs.length - 1].srcOut);

  function frameToTimeHelper(frame) {
    return frame / 30;
  }
});

test('mapCuesToSequence: maps cue times and warns on clamps, keeps end>=start', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ],
    { fps: 30 }
  );
  const cues = [{ id: 'a', index: 19, start: 6, end: 8, text: 'x' }]; // fully inside the cut gap
  const { cues: mapped, warnings } = mapCuesToSequence(cues, segs, { fps: 30 });
  assert.ok(mapped[0].end >= mapped[0].start);
  assert.ok(warnings.some((w) => w.includes('#19')));
});

test('mapCuesToSequence: a cue ending exactly at a segment boundary is not clamped and warns nothing (regression)', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    { fps: 30 }
  );
  const cues = [{ id: 'a', index: 1, start: 5, end: 7, text: 'x' }];
  const { cues: mapped, warnings } = mapCuesToSequence(cues, segs, { fps: 30 });
  assert.ok(Math.abs(mapped[0].end - 4.0) < 1e-9);
  assert.equal(warnings.length, 0);
});

test('mapCuesToSequence: a cue fully inside one cut gap collapses to zero length with a single combined warning', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    { fps: 30 }
  );
  const cues = [{ id: 'a', index: 3, start: 3, end: 4, text: 'x' }]; // both ends inside the [2,5] gap
  const { cues: mapped, warnings } = mapCuesToSequence(cues, segs, { fps: 30 });
  assert.equal(mapped[0].start, mapped[0].end);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('#3'));
  assert.ok(warnings[0].includes('長さ0'));
});

test('mapCuesToSequence: falls back to array position + 1 when a cue has no index (regression)', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
    ],
    { fps: 30 }
  );
  const cues = [{ id: 'a', start: 3, end: 4, text: 'x' }]; // no `index` field, inside the gap
  const { warnings } = mapCuesToSequence(cues, segs, { fps: 30 });
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0].includes('undefined'));
  assert.ok(warnings[0].includes('#1'));
});

test('sequenceDuration sums the kept segment lengths', () => {
  const segs = buildSegments(
    [
      { start: 0, end: 2 },
      { start: 5, end: 8 },
    ],
    { fps: 30 }
  );
  assert.ok(Math.abs(sequenceDuration(segs, 30) - 5) < 1e-9);
  assert.equal(sequenceDuration([], 30), 0);
});

test('segmentsFromSilenceJson: {speech, silence} seconds shape', () => {
  const json = { speech: [{ start: 0, end: 2 }, { start: 5, end: 7 }], silence: [{ start: 2, end: 5 }] };
  const segs = segmentsFromSilenceJson(json, { fps: 30 });
  assert.equal(segs.length, 2);
});

test('segmentsFromSilenceJson: start_frame/end_frame shape', () => {
  const json = { speech: [{ start_frame: 0, end_frame: 60 }] };
  const segs = segmentsFromSilenceJson(json, { fps: 30 });
  assert.equal(segs[0].srcIn, 0);
  assert.equal(segs[0].srcOut, 60);
});

test('segmentsFromSilenceJson: keepSilenceSec keeps short gaps whole, trims long gaps to the edges', () => {
  const json = {
    speech: [
      { start: 0, end: 2 }, // gap to next: 0.5s (short, <= keep)
      { start: 2.5, end: 4 },
      { start: 10, end: 12 }, // gap to previous: 6s (long, > keep=1)
    ],
  };
  const segs = segmentsFromSilenceJson(json, { fps: 30, keepSilenceSec: 1 });
  // short gap [2,2.5] (<=keep) is fully kept, and the near edge of the long gap [4,4.5]
  // is contiguous with it, so they all merge into one continuous block [0,4.5].
  assert.equal(segs.length, 2);
  assert.ok(Math.abs((segs[0].srcOut - segs[0].srcIn) / 30 - 4.5) < 0.05);

  // long gap [4,10] (6s > keep=1s) -> only 0.5s kept at each edge = 1s total extra,
  // 5s of true silence in the middle is dropped.
  const totalDuration = segs.reduce((sum, s) => sum + (s.srcOut - s.srcIn) / 30, 0);
  // 4.5s (first block, incl. one edge of the long gap) + 0.5s (other edge) + 2s (last speech) = 7s
  assert.ok(Math.abs(totalDuration - 7) < 0.1);
});

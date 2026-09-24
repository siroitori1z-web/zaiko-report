/**
 * sequence-map.js
 *
 * Maps time between SOURCE (original footage) and SEQUENCE (the
 * post-jet-cut timeline made by concatenating the kept/speech segments
 * of the source with no gaps between them).
 *
 * All internal segment math is done in integer frames to avoid rounding
 * drift; `rounding: 'outward'` (the default) rounds each kept segment's
 * in-point down (floor) and out-point up (ceil) so a cut never trims
 * wanted content.
 */

import { timeToFrame, frameToTime } from './timecode.js';

/**
 * Build the source<->sequence segment table from a list of kept
 * ("speech") segments.
 * @param {Array<{start?:number,end?:number,start_frame?:number,end_frame?:number}>} speech
 * @param {{fps?:number, rounding?:'outward'|'nearest', mergeOverlapping?:boolean}} [opts]
 * @returns {Array<{srcIn:number, srcOut:number, seqIn:number, seqOut:number}>} frame-based segments
 */
export function buildSegments(speech, { fps = 30, rounding = 'outward', mergeOverlapping = true } = {}) {
  const frameSegs = speech
    .map((s) => {
      let srcIn, srcOut;
      if (s.start_frame !== undefined || s.end_frame !== undefined) {
        srcIn = Math.round(s.start_frame);
        srcOut = Math.round(s.end_frame);
      } else if (rounding === 'outward') {
        srcIn = timeToFrame(s.start, fps, 'floor');
        srcOut = timeToFrame(s.end, fps, 'ceil');
      } else {
        srcIn = timeToFrame(s.start, fps, 'round');
        srcOut = timeToFrame(s.end, fps, 'round');
      }
      return { srcIn, srcOut };
    })
    .filter((s) => s.srcOut > s.srcIn)
    .sort((a, b) => a.srcIn - b.srcIn);

  const merged = [];
  for (const seg of frameSegs) {
    const top = merged[merged.length - 1];
    if (mergeOverlapping && top && seg.srcIn <= top.srcOut) {
      top.srcOut = Math.max(top.srcOut, seg.srcOut);
    } else {
      merged.push({ ...seg });
    }
  }

  let cursor = 0;
  return merged.map((seg) => {
    const length = seg.srcOut - seg.srcIn;
    const out = { srcIn: seg.srcIn, srcOut: seg.srcOut, seqIn: cursor, seqOut: cursor + length };
    cursor += length;
    return out;
  });
}

/**
 * Split `keepSilenceSec` worth of frames into an "after" share (kept right
 * after the preceding speech) and a "before" share (kept right before the
 * following speech), per the confirmed production rule (auto-edit stage
 * 12): `keepTailRatio` (default 0.7) controls the split, and the two
 * shares are computed so they always sum to exactly `round(keepSilenceSec
 * * fps)` frames -- the "before" share is the *complement* of the "after"
 * share (`total - after`), not independently rounded, so e.g. 1.0s @ 24fps
 * (24 frames total) with the default 0.7 ratio gives 17 after (round(16.8))
 * and 7 before (24 - 17), rather than 17/7.2->7 which could drift off the
 * 24-frame total.
 * @param {number} keepSilenceSec
 * @param {number} fps
 * @param {number} keepTailRatio
 * @returns {{totalFrames:number, afterFrames:number, beforeFrames:number}}
 */
function splitKeepFrames(keepSilenceSec, fps, keepTailRatio) {
  const totalFrames = Math.round(keepSilenceSec * fps);
  const afterFrames = Math.round(keepSilenceSec * fps * keepTailRatio);
  const beforeFrames = totalFrames - afterFrames;
  return { totalFrames, afterFrames, beforeFrames };
}

function assertKeepTailRatio(keepTailRatio) {
  if (typeof keepTailRatio !== 'number' || !Number.isFinite(keepTailRatio) || keepTailRatio < 0 || keepTailRatio > 1) {
    throw new Error(`Invalid keepTailRatio: ${keepTailRatio} (must be a number in [0, 1])`);
  }
}

/**
 * Build kept segments from the silence-detector JSON shape, optionally
 * applying the "keep N seconds of silence" method.
 *
 * `keepSilenceSec` / `keepTailRatio` method (documented precisely here --
 * matches the confirmed production rule, auto-edit stage 12):
 *
 * For each silence gap [a, b] between two consecutive speech segments:
 *   - if (b - a) <= keepSilenceSec: keep the whole gap (don't cut it at all).
 *   - if (b - a) >  keepSilenceSec: keep exactly `keepSilenceSec` seconds of
 *     it, split asymmetrically around the cut using `keepTailRatio` (default
 *     0.7): `keepSilenceSec * keepTailRatio` right AFTER the previous speech
 *     ([a, a + keep*ratio]) and `keepSilenceSec * (1 - keepTailRatio)` right
 *     BEFORE the next speech ([b - keep*(1-ratio), b]), dropping the middle.
 *
 * The video head (silence before the first speech segment) and video tail
 * (silence after the last speech segment, when `videoDuration` is given)
 * are handled the same way, using only the single relevant share:
 *   - Head: keep `keepSilenceSec * (1 - keepTailRatio)` immediately before
 *     the first speech (or the whole head gap, if it is shorter).
 *   - Tail: keep `keepSilenceSec * keepTailRatio` immediately after the
 *     last speech (or the whole tail gap, if it is shorter). Requires
 *     `videoDuration` (seconds); without it the tail is left untouched.
 *
 * `keepTailRatio=0.5` reproduces the old symmetric keep/2-keep/2 behavior.
 * All splits are computed in whole frames (see `splitKeepFrames`) so the
 * total kept length always frame-matches `round(keepSilenceSec * fps)`
 * exactly, then converted back to seconds before the normal outward
 * (floor-in/ceil-out) frame alignment in `buildSegments` -- since those
 * seconds already sit exactly on a frame boundary, that alignment is a
 * no-op and no further drift is introduced.
 *
 * @param {{speech?:Array<object>, silence?:Array<object>}} json
 * @param {{fps?:number, rounding?:'outward'|'nearest', mergeOverlapping?:boolean, keepSilenceSec?:number, keepTailRatio?:number, videoDuration?:number}} [opts]
 * @returns {Array<{srcIn:number, srcOut:number, seqIn:number, seqOut:number}>}
 */
export function segmentsFromSilenceJson(json, opts = {}) {
  const { fps = 30, rounding = 'outward', mergeOverlapping = true, keepSilenceSec = 0, keepTailRatio = 0.7, videoDuration } = opts;
  assertKeepTailRatio(keepTailRatio);
  const rawSpeech = Array.isArray(json?.speech) ? json.speech : [];

  const toSeconds = (s) =>
    s.start_frame !== undefined ? { start: s.start_frame / fps, end: s.end_frame / fps } : { start: s.start, end: s.end };

  const speechSegs = rawSpeech.map(toSeconds).sort((a, b) => a.start - b.start);
  let kept = speechSegs.map((s) => ({ start: s.start, end: s.end }));

  if (keepSilenceSec > 0 && speechSegs.length > 0) {
    const { afterFrames, beforeFrames } = splitKeepFrames(keepSilenceSec, fps, keepTailRatio);
    const extra = [];

    for (let i = 0; i < speechSegs.length - 1; i++) {
      const a = speechSegs[i].end;
      const b = speechSegs[i + 1].start;
      const gap = b - a;
      if (gap <= 0) continue;
      if (gap > keepSilenceSec) {
        // Frame-exact split: anchor on the same frames buildSegments would
        // give the neighboring speech segments (ceil for an out-point,
        // floor for an in-point), so the after/before pieces butt right up
        // against them with no spurious extra/missing frame.
        const aFrame = timeToFrame(a, fps, 'ceil');
        const bFrame = timeToFrame(b, fps, 'floor');
        extra.push({ start: frameToTime(aFrame, fps), end: frameToTime(aFrame + afterFrames, fps) });
        extra.push({ start: frameToTime(bFrame - beforeFrames, fps), end: frameToTime(bFrame, fps) });
      } else {
        extra.push({ start: a, end: b });
      }
    }

    // Video head: silence before the first speech segment. Keep only the
    // head-side share (`beforeFrames`, i.e. keep*(1-keepTailRatio)) right
    // before the first speech, or the whole head gap if it's shorter.
    const firstB = timeToFrame(speechSegs[0].start, fps, 'floor');
    if (firstB > 0) {
      const headFrames = Math.min(firstB, beforeFrames);
      if (headFrames > 0) {
        extra.push({ start: frameToTime(firstB - headFrames, fps), end: frameToTime(firstB, fps) });
      }
    }

    // Video tail: silence after the last speech segment, up to
    // `videoDuration` (if known). Keep only the tail-side share
    // (`afterFrames`, i.e. keep*keepTailRatio) right after the last speech,
    // or the whole tail gap if it's shorter.
    if (typeof videoDuration === 'number' && Number.isFinite(videoDuration)) {
      const lastA = timeToFrame(speechSegs[speechSegs.length - 1].end, fps, 'ceil');
      const durFrame = Math.round(videoDuration * fps);
      const tailGapFrames = durFrame - lastA;
      if (tailGapFrames > 0) {
        const tailFrames = Math.min(tailGapFrames, afterFrames);
        if (tailFrames > 0) {
          extra.push({ start: frameToTime(lastA, fps), end: frameToTime(lastA + tailFrames, fps) });
        }
      }
    }

    kept = kept.concat(extra);
  }

  return buildSegments(kept, { fps, rounding, mergeOverlapping });
}

/**
 * Convert a SOURCE time to SEQUENCE time.
 *
 * Boundary rule: a time landing exactly on a kept segment's out-point
 * (within the usual 1ms/frame epsilon, via `timeToFrame`) belongs to
 * that segment -- it maps to the segment's `seqOut`, is NOT considered
 * clamped, and produces no warning. This applies to every segment,
 * including the last one (so the very end of the last kept segment maps
 * exactly to `sequenceDuration`, not one frame short of it).
 *
 * Gap rule: in sequence time a cut collapses to a single point
 * (`segs[i].seqOut === segs[i+1].seqIn`), since the cut content simply
 * isn't part of the sequence. Any source time strictly inside a cut gap
 * therefore always maps to that single cut-point frame -- never to
 * `seqOut - 1` or any other frame "inside" the previous segment.
 * `direction` still reports which edge of the gap was nearer (used by
 * `mapCuesToSequence` to word its warning), but it no longer changes
 * *which frame* is returned.
 *
 * @param {number} tSec source time in seconds
 * @param {Array<object>} segs from buildSegments
 * @param {{fps?:number, clamp?:boolean}} [opts]
 * @returns {{time:number, frame:number, clamped:boolean, direction:'none'|'forward'|'backward'}}
 */
export function sourceToSequence(tSec, segs, { fps = 30, clamp = true } = {}) {
  const f = timeToFrame(tSec, fps, 'round');

  for (const seg of segs) {
    // Inclusive on both ends: `f === seg.srcOut` is this segment's own
    // end boundary, not (yet) the start of a cut.
    if (f >= seg.srcIn && f <= seg.srcOut) {
      const seqFrame = seg.seqIn + (f - seg.srcIn);
      return { time: frameToTime(seqFrame, fps), frame: seqFrame, clamped: false, direction: 'none' };
    }
  }

  if (!clamp) {
    throw new Error(`Time ${tSec}s falls in a cut region and clamp=false`);
  }
  if (segs.length === 0) {
    return { time: 0, frame: 0, clamped: true, direction: 'none' };
  }
  if (f < segs[0].srcIn) {
    return { time: frameToTime(segs[0].seqIn, fps), frame: segs[0].seqIn, clamped: true, direction: 'forward' };
  }
  const last = segs[segs.length - 1];
  if (f > last.srcOut) {
    // Beyond the end of all kept content -> the very end of the sequence.
    return { time: frameToTime(last.seqOut, fps), frame: last.seqOut, clamped: true, direction: 'backward' };
  }
  for (let i = 0; i < segs.length - 1; i++) {
    if (f > segs[i].srcOut && f < segs[i + 1].srcIn) {
      // Strictly inside the cut gap: it collapses to one point in
      // sequence time (segs[i].seqOut === segs[i+1].seqIn). `direction`
      // only records which edge was nearer, for the caller's warning text.
      const distBack = f - segs[i].srcOut;
      const distFwd = segs[i + 1].srcIn - f;
      const direction = distBack < distFwd ? 'backward' : 'forward';
      const cutFrame = segs[i + 1].seqIn;
      return { time: frameToTime(cutFrame, fps), frame: cutFrame, clamped: true, direction };
    }
  }
  // Unreachable given the checks above, but keep a safe fallback.
  return { time: 0, frame: 0, clamped: true, direction: 'none' };
}

/**
 * Convert a SEQUENCE time back to SOURCE time.
 *
 * Boundary convention: since a cut collapses to a single point in
 * sequence time (`segs[i].seqOut === segs[i+1].seqIn`), a sequence time
 * landing exactly on that point is ambiguous -- it is both "the end of
 * the previous kept segment" and "the start of the next" in source time.
 * This function resolves that ambiguity by preferring the START of the
 * NEXT segment (`segs[i+1].srcIn`), because segments are checked in
 * order with an exclusive upper bound (`f < seg.seqOut`) and the next
 * segment's inclusive lower bound (`f >= seg.seqIn`) matches first. This
 * is a deliberate, documented choice, not a bug: it means "the frame
 * right after a cut" reads as the first frame of what comes next, which
 * matches how a cut is usually talked about ("cut to the next line").
 * The very end of the whole sequence (`tSec === sequenceDuration`) has no
 * "next segment" to prefer, so it resolves to the true end of the last
 * kept segment (`last.srcOut`), mirroring `sourceToSequence`'s symmetric
 * boundary rule.
 *
 * @param {number} tSec sequence time in seconds
 * @param {Array<object>} segs
 * @param {{fps?:number}} [opts]
 * @returns {{time:number, frame:number, clamped:boolean}}
 */
export function sequenceToSource(tSec, segs, { fps = 30 } = {}) {
  const f = timeToFrame(tSec, fps, 'round');
  for (const seg of segs) {
    if (f >= seg.seqIn && f < seg.seqOut) {
      const srcFrame = seg.srcIn + (f - seg.seqIn);
      return { time: frameToTime(srcFrame, fps), frame: srcFrame, clamped: false };
    }
  }
  if (segs.length === 0) return { time: 0, frame: 0, clamped: true };
  if (f < segs[0].seqIn) {
    return { time: frameToTime(segs[0].srcIn, fps), frame: segs[0].srcIn, clamped: true };
  }
  const last = segs[segs.length - 1];
  // f >= last.seqOut: the true end of the sequence (or beyond it) maps to
  // the true end of the last kept segment, not one frame short of it.
  return { time: frameToTime(last.srcOut, fps), frame: last.srcOut, clamped: true };
}

/**
 * Map a whole cue list from source time to sequence time.
 *
 * A cue whose start AND end both fall inside the same cut gap collapses
 * to a single zero-length point (see `sourceToSequence`'s gap rule); it
 * is kept (not dropped) and reported with a dedicated warning rather
 * than the generic per-edge ones, since `validate.js`'s `ZERO_LENGTH`
 * check will also flag the result.
 *
 * @param {Array<object>} cues
 * @param {Array<object>} segs
 * @param {{fps?:number}} [opts]
 * @returns {{cues:Array<object>, warnings:string[]}}
 */
export function mapCuesToSequence(cues, segs, { fps = 30 } = {}) {
  const warnings = [];
  const describe = (dir) =>
    dir === 'forward' ? 'カット区間内のため次の発話区間の頭に寄せました' : 'カット区間内のため前の発話区間の末尾に寄せました';

  const mapped = cues.map((cue, i) => {
    const label = cue.index ?? i + 1;
    const s = sourceToSequence(cue.start, segs, { fps });
    const e = sourceToSequence(cue.end, segs, { fps });

    if (s.clamped && e.clamped && s.frame === e.frame) {
      warnings.push(`#${label}: カット区間内に収まっているため長さ0になりました`);
    } else {
      if (s.clamped) warnings.push(`#${label}: 開始が${describe(s.direction)}`);
      if (e.clamped) warnings.push(`#${label}: 終了が${describe(e.direction)}`);
    }

    let newStart = s.time;
    let newEnd = e.time;
    if (newEnd < newStart) newEnd = newStart;
    return { ...cue, start: newStart, end: newEnd };
  });

  return { cues: mapped, warnings };
}

/**
 * Total duration of the sequence timeline.
 * @param {Array<object>} segs
 * @param {number} [fps=30]
 * @returns {number}
 */
export function sequenceDuration(segs, fps = 30) {
  if (!segs.length) return 0;
  return frameToTime(segs[segs.length - 1].seqOut, fps);
}

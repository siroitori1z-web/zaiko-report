/**
 * split.js
 *
 * Splitting a single cue into two, mirroring the behaviour of the
 * original single-file editor: the split time is derived from the
 * playhead / caret position, and the split text point favors landing
 * right after punctuation/whitespace near the proportional position.
 */

import { snapTime, timeToFrame, frameToTime } from './timecode.js';

const BREAK_CHARS = new Set(Array.from('、。，．,.!?！？…　 '));

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Avoid splitting inside a UTF-16 surrogate pair. */
function safeSplitIndex(text, idx) {
  if (idx <= 0) return 0;
  if (idx >= text.length) return text.length;
  const before = text.charCodeAt(idx - 1);
  const at = text.charCodeAt(idx);
  if (isHighSurrogate(before) && isLowSurrogate(at)) {
    return idx - 1;
  }
  return idx;
}

/**
 * Find the best index to split `text` near `target`, preferring a
 * position right after a punctuation/space character within a window of
 * +/-30% of the text length, else falling back to the exact proportional
 * position (surrogate-safe).
 * @param {string} text
 * @param {number} target proportional character index (float)
 * @returns {number}
 */
function findTextSplitIndex(text, target) {
  const len = text.length;
  if (len === 0) return 0;
  const window = Math.max(1, Math.round(len * 0.3));
  const base = Math.round(target);
  let best = null;
  let bestDist = Infinity;
  for (let i = Math.max(1, base - window); i <= Math.min(len - 1, base + window); i++) {
    // A split right after a break char means text[i-1] is a break char.
    if (BREAK_CHARS.has(text[i - 1])) {
      const dist = Math.abs(i - base);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
  }
  const idx = best !== null ? best : Math.min(Math.max(base, 1), Math.max(len - 1, 1));
  return safeSplitIndex(text, idx);
}

/**
 * Split a cue into two.
 * @param {object} cue
 * @param {{caret?:number, playhead?:number, fps?:number, idGen?:() => string}} opts
 * @returns {[object, object]|null} [front, back], or null if the cue is
 *   too short to split (< 2 frames).
 */
export function splitCue(cue, { caret, playhead, fps = 30, idGen } = {}) {
  const genId = idGen || (() => `split_${Math.random().toString(36).slice(2, 10)}`);
  const startFrame = timeToFrame(cue.start, fps, 'round');
  const endFrame = timeToFrame(cue.end, fps, 'round');
  const lengthFrames = endFrame - startFrame;
  if (lengthFrames < 2) return null;

  const text = cue.text || '';
  const duration = cue.end - cue.start;

  const playheadInside =
    typeof playhead === 'number' && playhead > cue.start && playhead < cue.end;

  let splitTime;
  let textRatio;

  if (caret !== undefined && caret !== null) {
    textRatio = text.length > 0 ? caret / text.length : 0.5;
    splitTime = playheadInside ? playhead : cue.start + duration * textRatio;
  } else {
    splitTime = playheadInside ? playhead : cue.start + duration / 2;
    textRatio = duration > 0 ? (splitTime - cue.start) / duration : 0.5;
  }

  // Snap split time to a frame boundary, guaranteeing >=1 frame each side.
  let splitFrame = timeToFrame(splitTime, fps, 'round');
  if (splitFrame <= startFrame) splitFrame = startFrame + 1;
  if (splitFrame >= endFrame) splitFrame = endFrame - 1;
  const snappedSplitTime = frameToTime(splitFrame, fps);

  const targetCharIndex = caret !== undefined && caret !== null ? caret : textRatio * text.length;
  const splitIdx = findTextSplitIndex(text, targetCharIndex);

  const frontText = text.slice(0, splitIdx).trim();
  const backText = text.slice(splitIdx).trim();

  const front = {
    ...cue,
    end: snapTime(snappedSplitTime, fps, 'round'),
    text: frontText,
    split: true,
  };
  const back = {
    ...cue,
    id: genId(),
    index: 0,
    start: snapTime(snappedSplitTime, fps, 'round'),
    end: cue.end,
    text: backText,
    origStart: snapTime(snappedSplitTime, fps, 'round'),
    origEnd: cue.end,
    origText: backText,
    needsReview: cue.needsReview,
    split: true,
    added: undefined,
  };
  delete back.added;

  return [front, back];
}

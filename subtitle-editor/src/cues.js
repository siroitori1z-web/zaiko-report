/**
 * cues.js
 *
 * Pure functions operating on arrays of cue objects. None of these mutate
 * their inputs; they always return new arrays/objects. A cue is expected
 * to look like:
 *   { id, index, start, end, text, needsReview, origStart, origEnd,
 *     origText, added?, split? }
 */

import { snapTime, timeToFrame } from './timecode.js';

/**
 * Stable sort of cues by start time (ties keep original relative order).
 * @param {Array<object>} cues
 * @returns {Array<object>}
 */
export function sortCuesStable(cues) {
  return cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => (a.cue.start - b.cue.start) || (a.i - b.i))
    .map((x) => x.cue);
}

/**
 * @param {Array<object>} cues
 * @returns {boolean} true if cues are already sorted by start time.
 */
export function isSorted(cues) {
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].start) return false;
  }
  return true;
}

function findIndexById(cues, id) {
  return cues.findIndex((c) => c.id === id);
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Shift a cue's start/end by deltaSec, keeping its length, snapping to a
 * frame boundary and clamping into [0, duration].
 * @param {Array<object>} cues
 * @param {string} id
 * @param {number} deltaSec
 * @param {{fps?:number, duration?:number}} [opts]
 * @returns {Array<object>}
 */
export function moveCue(cues, id, deltaSec, { fps = 30, duration = Infinity } = {}) {
  const i = findIndexById(cues, id);
  if (i === -1) return cues;
  const cue = cues[i];
  const length = cue.end - cue.start;
  let newStart = snapTime(cue.start + deltaSec, fps, 'round');
  newStart = clamp(newStart, 0, Math.max(0, duration - length));
  const newEnd = newStart + length;
  const next = cues.slice();
  next[i] = { ...cue, start: newStart, end: newEnd };
  return next;
}

/**
 * Change a cue's start and/or end time, snapping each to a frame boundary
 * and clamping to [0, duration]. If the result would have end < start,
 * end is clamped to start (zero-length), never swapped.
 * @param {Array<object>} cues
 * @param {string} id
 * @param {{start?:number, end?:number}} changes
 * @param {{fps?:number, duration?:number}} [opts]
 * @returns {Array<object>}
 */
export function trimCue(cues, id, { start, end } = {}, { fps = 30, duration = Infinity } = {}) {
  const i = findIndexById(cues, id);
  if (i === -1) return cues;
  const cue = cues[i];
  let newStart = start !== undefined ? clamp(snapTime(start, fps, 'round'), 0, duration) : cue.start;
  let newEnd = end !== undefined ? clamp(snapTime(end, fps, 'round'), 0, duration) : cue.end;
  if (newEnd < newStart) newEnd = newStart;
  const next = cues.slice();
  next[i] = { ...cue, start: newStart, end: newEnd };
  return next;
}

/**
 * Insert a new cue at time `at`.
 * @param {Array<object>} cues
 * @param {{at:number, length?:number, text?:string, fps?:number, duration?:number, idGen?:() => string}} opts
 * @returns {{cues: Array<object>, id: string}}
 */
export function addCue(cues, { at, length = 2.0, text = '', fps = 30, duration = Infinity, idGen } = {}) {
  const genId = idGen || (() => `new_${Math.random().toString(36).slice(2, 10)}`);
  const start = clamp(snapTime(at, fps, 'round'), 0, duration);
  const end = Math.min(start + length, duration);
  const id = genId();
  const newCue = {
    id,
    index: 0,
    start,
    end: end < start ? start : end,
    text,
    needsReview: false,
    origStart: start,
    origEnd: end < start ? start : end,
    origText: text,
    added: true,
  };
  const merged = sortCuesStable([...cues, newCue]);
  return { cues: renumber(merged), id };
}

/**
 * Remove a cue by id.
 * @param {Array<object>} cues
 * @param {string} id
 * @returns {{cues: Array<object>, removed: object|null, removedIndex: number}}
 */
export function deleteCue(cues, id) {
  const i = findIndexById(cues, id);
  if (i === -1) return { cues, removed: null, removedIndex: -1 };
  const removed = cues[i];
  const next = cues.slice(0, i).concat(cues.slice(i + 1));
  return { cues: renumber(next), removed, removedIndex: i };
}

/**
 * Decide which cue should become selected after a deletion at
 * `removedIndex` in the (already updated, shorter) cues array.
 * @param {Array<object>} cues cues AFTER removal
 * @param {number} removedIndex index the removed cue used to occupy
 * @returns {string|null}
 */
export function nextSelectionAfterDelete(cues, removedIndex) {
  if (cues.length === 0) return null;
  if (removedIndex >= cues.length) return cues[cues.length - 1].id;
  return cues[removedIndex].id;
}

/**
 * Renumber cues' `index` field 1..N in array order.
 * @param {Array<object>} cues
 * @returns {Array<object>}
 */
export function renumber(cues) {
  return cues.map((c, i) => (c.index === i + 1 ? c : { ...c, index: i + 1 }));
}

function frameRangeOf(cue, fps) {
  return [timeToFrame(cue.start, fps, 'round'), timeToFrame(cue.end, fps, 'round')];
}

/**
 * Find indices of cues active (visible) at a given frame or time.
 * Visibility rule: startFrame <= f < endFrame.
 * @param {Array<object>} cues
 * @param {number} frameOrTime frame number (integer) or time in seconds
 * @param {{fps?:number, isFrame?:boolean}} [opts] pass isFrame:true if
 *   `frameOrTime` is already a frame number; otherwise it is treated as a
 *   time in seconds and converted using fps.
 * @returns {number[]}
 */
export function activeCuesAt(cues, frameOrTime, { fps = 30, isFrame = false } = {}) {
  const f = isFrame ? frameOrTime : timeToFrame(frameOrTime, fps, 'round');
  const result = [];
  cues.forEach((cue, i) => {
    const [sf, ef] = frameRangeOf(cue, fps);
    if (sf <= f && f < ef) result.push(i);
  });
  return result;
}

/**
 * Among cues active at time t, pick the one with the latest start (used to
 * auto-follow selection during playback).
 * @param {Array<object>} cues
 * @param {number} t time in seconds
 * @param {{fps?:number}} [opts]
 * @returns {object|null}
 */
export function pickFollowCue(cues, t, { fps = 30 } = {}) {
  const idxs = activeCuesAt(cues, t, { fps });
  if (idxs.length === 0) return null;
  let best = cues[idxs[0]];
  for (const i of idxs) {
    if (cues[i].start > best.start) best = cues[i];
  }
  return best;
}

/**
 * Shift all cues (or those starting at/after `from`) by deltaSec. Useful
 * for a global offset correction.
 * @param {Array<object>} cues
 * @param {number} deltaSec
 * @param {{fps?:number, from?:number}} [opts]
 * @returns {Array<object>}
 */
export function shiftAll(cues, deltaSec, { fps = 30, from } = {}) {
  return cues.map((cue) => {
    if (from !== undefined && cue.start < from) return cue;
    const length = cue.end - cue.start;
    const newStart = Math.max(0, snapTime(cue.start + deltaSec, fps, 'round'));
    return { ...cue, start: newStart, end: newStart + length };
  });
}

/**
 * @param {object} cue
 * @returns {boolean} true if the cue's start/end/text differ from its
 *   recorded original values.
 */
export function isModified(cue) {
  return cue.start !== cue.origStart || cue.end !== cue.origEnd || cue.text !== cue.origText;
}

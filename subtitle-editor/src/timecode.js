/**
 * timecode.js
 *
 * Pure time/frame/timecode conversion helpers.
 *
 * Frame-rate conventions
 * -----------------------
 * The editor's default is 30 fps NON-drop-frame (NDF). Real footage often
 * runs at 29.99842 fps but we deliberately treat it as *exactly* 30 fps NDF:
 * treating it as 29.97 would drift ~13 frames over a 7 minute video, which
 * is far worse than the negligible real-world mismatch of using an exact
 * 30 fps grid. Any integer or fractional fps is still supported, and SMPTE
 * drop-frame (DF) timecode is supported as an explicit opt-in for the
 * classic 29.97 / 59.94 rates.
 *
 * Epsilon-tolerant frame rounding
 * --------------------------------
 * SRT timestamps are millisecond-rounded. When converting a millisecond
 * time back to a frame number, floating point noise (or legitimate
 * millisecond rounding) can put a value that is *conceptually* exactly on
 * a frame boundary a fraction of a frame away from it (e.g. 19.042s at
 * 24fps is 457.008 frames, i.e. 0.33ms away from the frame-457 boundary).
 * `timeToFrame` snaps any value within 1ms of a frame boundary onto that
 * boundary *before* applying floor/ceil/round, so `floor`/`ceil` never
 * accidentally walk one frame off because of sub-millisecond noise.
 */

/** Default project frame rate (30 fps, non-drop-frame). */
export const DEFAULT_FPS = 30;

/** Tolerance, in seconds, used to snap a time onto a frame boundary. */
const EPSILON_SEC = 0.001;

function assertFps(fps) {
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Invalid fps: ${fps}`);
  }
}

/**
 * Convert a time in seconds to a frame number.
 * @param {number} sec time in seconds
 * @param {number} [fps=30]
 * @param {'floor'|'ceil'|'round'|'nearest-boundary'} [mode='floor']
 * @returns {number} integer frame number
 */
export function timeToFrame(sec, fps = DEFAULT_FPS, mode = 'floor') {
  assertFps(fps);
  if (typeof sec !== 'number' || !Number.isFinite(sec)) {
    throw new Error(`Invalid time: ${sec}`);
  }
  const raw = sec * fps;
  const rounded = Math.round(raw);
  // Snap to the boundary if within 1ms (converted to frame units).
  const epsilonFrames = EPSILON_SEC * fps;
  const adjusted = Math.abs(raw - rounded) <= epsilonFrames ? rounded : raw;
  switch (mode) {
    case 'floor':
      return Math.floor(adjusted);
    case 'ceil':
      return Math.ceil(adjusted);
    case 'round':
    case 'nearest-boundary':
      return Math.round(adjusted);
    default:
      throw new Error(`Invalid rounding mode: ${mode}`);
  }
}

/**
 * Convert a frame number to a time in seconds.
 * @param {number} frame
 * @param {number} [fps=30]
 * @returns {number}
 */
export function frameToTime(frame, fps = DEFAULT_FPS) {
  assertFps(fps);
  return frame / fps;
}

/**
 * Snap a time to the nearest frame boundary (per `mode`) and return it as
 * a time in seconds.
 * @param {number} sec
 * @param {number} [fps=30]
 * @param {'floor'|'ceil'|'round'|'nearest-boundary'} [mode='round']
 * @returns {number}
 */
export function snapTime(sec, fps = DEFAULT_FPS, mode = 'round') {
  return frameToTime(timeToFrame(sec, fps, mode), fps);
}

function pad2(n) {
  return String(Math.trunc(n)).padStart(2, '0');
}

/**
 * Format a frame count as SMPTE timecode "HH:MM:SS:FF" (or "HH:MM:SS;FF"
 * for drop-frame).
 * @param {number} frames total elapsed frame count (integer)
 * @param {{fps?:number, dropFrame?:boolean}} [opts]
 * @returns {string}
 */
export function framesToTimecode(frames, { fps = DEFAULT_FPS, dropFrame = false } = {}) {
  assertFps(fps);
  if (!Number.isFinite(frames)) throw new Error(`Invalid frame count: ${frames}`);
  const nominal = Math.round(fps);
  frames = Math.round(frames);

  if (!dropFrame) {
    const framesPerHour = nominal * 3600;
    const framesPerDay = framesPerHour * 24;
    let f = ((frames % framesPerDay) + framesPerDay) % framesPerDay;
    const hh = Math.floor(f / framesPerHour);
    f -= hh * framesPerHour;
    const mm = Math.floor(f / (nominal * 60));
    f -= mm * nominal * 60;
    const ss = Math.floor(f / nominal);
    const ff = f - ss * nominal;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
  }

  if (nominal !== 30 && nominal !== 60) {
    throw new Error('Drop-frame timecode is only supported for 29.97/59.94 fps');
  }
  const dropFrames = nominal === 30 ? 2 : 4;
  const framesPerMin = nominal * 60 - dropFrames;
  const framesPer10Min = nominal * 600 - dropFrames * 9;
  const framesPerDay = (nominal * 3600 - dropFrames * 9 * 6) * 24 + 0; // see note below
  // Note: rather than derive a day wrap constant, just wrap using the
  // simpler (and numerically equivalent) approach of never wrapping frames
  // outside [0, ~24h] in practice; guard against negative input instead.
  let frameNumber = frames < 0 ? 0 : frames;

  const d = Math.floor(frameNumber / framesPer10Min);
  const m = frameNumber % framesPer10Min;
  if (m >= dropFrames) {
    frameNumber += dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMin);
  } else {
    frameNumber += dropFrames * 9 * d;
  }

  const ff = frameNumber % nominal;
  const totalSeconds = Math.floor(frameNumber / nominal);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  void framesPerDay;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
}

/**
 * Parse an SMPTE timecode string back into a frame count. Accepts
 * "HH:MM:SS:FF", "HH:MM:SS;FF" (drop-frame) and the shorthand "MM:SS:FF".
 * @param {string} str
 * @param {{fps?:number, dropFrame?:boolean}} [opts] dropFrame is inferred
 *   from the ';' separator when not given explicitly.
 * @returns {number} frame count
 */
export function timecodeToFrames(str, { fps = DEFAULT_FPS, dropFrame } = {}) {
  assertFps(fps);
  if (typeof str !== 'string') throw new Error('Invalid timecode string');
  const trimmed = str.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?[:;](\d{1,3})$/);
  if (!m) throw new Error(`Invalid timecode: ${str}`);
  const df = dropFrame !== undefined ? dropFrame : trimmed.includes(';');
  let hh, mm, ss, ff;
  if (m[3] !== undefined) {
    hh = Number(m[1]);
    mm = Number(m[2]);
    ss = Number(m[3]);
    ff = Number(m[4]);
  } else {
    // "MM:SS:FF" shorthand
    hh = 0;
    mm = Number(m[1]);
    ss = Number(m[2]);
    ff = Number(m[4]);
  }
  const nominal = Math.round(fps);

  if (!df) {
    return (hh * 3600 + mm * 60 + ss) * nominal + ff;
  }
  if (nominal !== 30 && nominal !== 60) {
    throw new Error('Drop-frame timecode is only supported for 29.97/59.94 fps');
  }
  const dropFrames = nominal === 30 ? 2 : 4;
  const totalMinutes = hh * 60 + mm;
  const frameNumber =
    (hh * 3600 + mm * 60 + ss) * nominal + ff - dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  return frameNumber;
}

/**
 * Format a time in seconds as SRT "HH:MM:SS,mmm".
 * @param {number} sec
 * @returns {string}
 */
export function formatSrtTime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) sec = 0;
  let totalMs = Math.round(sec * 1000);
  if (totalMs < 0) totalMs = 0;
  const ms = totalMs % 1000;
  let totalSec = Math.floor(totalMs / 1000);
  const ss = totalSec % 60;
  totalSec = Math.floor(totalSec / 60);
  const mm = totalSec % 60;
  const hh = Math.floor(totalSec / 60);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)},${String(ms).padStart(3, '0')}`;
}

/**
 * Parse an SRT timestamp "HH:MM:SS,mmm" (or with '.' separator, or 1-3
 * digit ms) into seconds.
 * @param {string} str
 * @returns {number}
 */
export function parseSrtTime(str) {
  if (typeof str !== 'string') throw new Error('Invalid SRT time');
  const trimmed = str.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) throw new Error(`Invalid SRT time: ${str}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const msStr = m[4].padEnd(3, '0');
  const ms = Number(msStr);
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

/**
 * Format a time for UI display as "M:SS.mmm", or "M:SS+FF" when
 * `frames:true` is given.
 * @param {number} sec
 * @param {{fps?:number, frames?:boolean}} [opts]
 * @returns {string}
 */
export function formatClock(sec, { fps = DEFAULT_FPS, frames = false } = {}) {
  const sign = sec < 0 ? '-' : '';
  const abs = Math.abs(sec);
  if (frames) {
    const frame = timeToFrame(abs, fps, 'round');
    const totalFrames = frame;
    const framesPerSec = Math.round(fps);
    const ff = totalFrames % framesPerSec;
    const totalSec = Math.floor(totalFrames / framesPerSec);
    const ss = totalSec % 60;
    const mm = Math.floor(totalSec / 60);
    return `${sign}${mm}:${pad2(ss)}+${pad2(ff)}`;
  }
  const totalMs = Math.round(abs * 1000);
  const ms = totalMs % 1000;
  let totalSec = Math.floor(totalMs / 1000);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60);
  return `${sign}${mm}:${pad2(ss)}.${String(ms).padStart(3, '0')}`;
}

/**
 * Parse a flexible, human-typed time string for UI inputs. Accepts:
 *  - "1:23.456" / "83.456" (plain seconds, optionally minutes:seconds)
 *  - "00:01:23,456" / "00:01:23.456" (SRT-like)
 *  - "00:01:23:12" (timecode, frame suffix)
 *  - "+12f" / "-3f" (relative frame offsets) -> { relativeFrames: n }
 * @param {string} str
 * @param {{fps?:number}} [opts]
 * @returns {number|{relativeFrames:number}|null} seconds, a relative-frame
 *   descriptor, or null if the string could not be parsed.
 */
export function parseFlexibleTime(str, { fps = DEFAULT_FPS } = {}) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed === '') return null;

  const relMatch = trimmed.match(/^([+-])\s*(\d+)\s*f$/i);
  if (relMatch) {
    const n = Number(relMatch[2]) * (relMatch[1] === '-' ? -1 : 1);
    return { relativeFrames: n };
  }

  // SRT-style with comma or dot ms separator and full HH:MM:SS
  if (/^\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}$/.test(trimmed)) {
    try {
      return parseSrtTime(trimmed);
    } catch {
      return null;
    }
  }

  // Timecode "HH:MM:SS:FF" or "MM:SS:FF"
  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?:\d{1,3}$/.test(trimmed)) {
    try {
      const frames = timecodeToFrames(trimmed, { fps, dropFrame: false });
      return frameToTime(frames, fps);
    } catch {
      return null;
    }
  }

  // "M:SS.mmm" or "M:SS" (minutes:seconds, optional fractional seconds)
  const clockMatch = trimmed.match(/^(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/);
  if (clockMatch) {
    const mm = Number(clockMatch[1]);
    const ss = Number(clockMatch[2]);
    if (ss >= 60) return null;
    return mm * 60 + ss;
  }

  // Plain seconds (possibly fractional)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return null;
}

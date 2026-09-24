/**
 * srt.js
 *
 * Parsing and serialization of the SubRip (.srt) subtitle format, tolerant
 * of the various malformations real-world files tend to have (garbled
 * index lines, CRLF/CR line endings, BOM, stray blank lines, trailing
 * spaces, multi-line cue text).
 */

import { formatSrtTime, parseSrtTime } from './timecode.js';

const REVIEW_MARKER_RE = /[（(]要確認[）)]/g;

function defaultIdGen() {
  let n = 0;
  return () => `c${++n}`;
}

/**
 * Strip a "needs review" marker ("（要確認）" or "(要確認)") from text.
 * @param {string} text
 * @returns {{text:string, needsReview:boolean}}
 */
function stripReviewMarker(text) {
  const needsReview = REVIEW_MARKER_RE.test(text);
  REVIEW_MARKER_RE.lastIndex = 0;
  const stripped = text.replace(REVIEW_MARKER_RE, '').trim();
  return { text: stripped, needsReview };
}

/**
 * Parse SRT file text into cues.
 * @param {string} text raw file contents
 * @param {{fps?:number, idGen?:() => string}} [opts]
 * @returns {{cues: Array<object>, warnings: Array<{line:number, message:string}>}}
 */
export function parseSrt(text, { idGen } = {}) {
  const genId = idGen || defaultIdGen();
  const warnings = [];
  if (typeof text !== 'string') {
    return { cues: [], warnings: [{ line: 0, message: 'SRTテキストが不正です' }] };
  }

  // Strip BOM, normalize line endings.
  let normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  // Split into blocks on one-or-more blank lines.
  const blocks = normalized.split(/\n{2,}/);

  const cues = [];
  let index = 0;
  let lineOffset = 0;

  for (const rawBlock of blocks) {
    const blockStartLine = lineOffset;
    const lines = rawBlock.split('\n');
    lineOffset += lines.length + 1; // +1 for the blank separator line

    // Drop leading/trailing fully-blank lines within the block.
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) continue;

    const TIME_LINE_RE = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-{2,3}>\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/;

    // Find the timecode line: it is normally lines[1] (after a numeric
    // index), but tolerate a missing index (timecode on lines[0]) or a
    // garbled/non-numeric index line (skip just that one line).
    let timeLineIdx = -1;
    if (TIME_LINE_RE.test(lines[0])) {
      timeLineIdx = 0;
    } else if (lines.length > 1 && TIME_LINE_RE.test(lines[1])) {
      timeLineIdx = 1; // lines[0] is treated as a (possibly garbled) index line
    }

    if (timeLineIdx === -1) {
      warnings.push({ line: blockStartLine, message: `解析できないブロックをスキップしました（タイムコード行が見つかりません）` });
      continue;
    }

    const timeLine = lines[timeLineIdx];
    const timeMatch = timeLine.match(TIME_LINE_RE);
    let cursor = timeLineIdx + 1;

    let start, end;
    try {
      start = parseSrtTime(timeMatch[1]);
      end = parseSrtTime(timeMatch[2]);
    } catch {
      warnings.push({ line: blockStartLine, message: `タイムコードの形式が不正でスキップしました: "${timeLine.trim()}"` });
      continue;
    }

    const textLines = lines.slice(cursor).map((l) => l.replace(/\s+$/, ''));
    const rawText = textLines.join('\n').trim();
    const { text: strippedText, needsReview } = stripReviewMarker(rawText);

    index++;
    cues.push({
      id: genId(),
      index,
      start,
      end,
      text: strippedText,
      needsReview,
      origStart: start,
      origEnd: end,
      origText: strippedText,
    });
  }

  return { cues, warnings };
}

/**
 * Serialize cues back to SRT text.
 * @param {Array<object>} cues
 * @param {{renumber?:boolean, keepReviewMarker?:boolean, dropEmpty?:boolean, eol?:string}} [opts]
 * @returns {string}
 */
export function serializeSrt(cues, { renumber = true, keepReviewMarker = false, dropEmpty = false, eol = '\n' } = {}) {
  let list = cues;
  if (dropEmpty) {
    list = list.filter((c) => (c.text || '').trim() !== '');
  }

  const blocks = list.map((cue, i) => {
    const idx = renumber ? i + 1 : cue.index;
    let text = cue.text || '';
    if (cue.needsReview && keepReviewMarker) {
      text = text ? `${text}（要確認）` : '（要確認）';
    }
    const startStr = formatSrtTime(cue.start);
    const endStr = formatSrtTime(cue.end);
    return `${idx}${eol}${startStr} --> ${endStr}${eol}${text}`;
  });

  if (blocks.length === 0) return '';
  return blocks.join(`${eol}${eol}`) + eol;
}

/**
 * Derive the "_corrected" output filename for a source SRT filename.
 * @param {string} name e.g. "foo.srt"
 * @returns {string}
 */
export function correctedFileName(name) {
  if (typeof name !== 'string' || name === '') return 'corrected.srt';
  const m = name.match(/^(.*?)(\.[^./\\]+)?$/);
  const base = m[1];
  const ext = m[2] || '';
  if (/_corrected$/i.test(base)) {
    return `${base}${ext}`;
  }
  return `${base}_corrected${ext}`;
}

/**
 * validate.js
 *
 * Static checks over a cue list, and a pre-delivery "final check" helper.
 */

const TOO_SHORT_SEC = 0.5;

/**
 * @param {Array<object>} cues
 * @param {{fps?:number, duration?:number}} [opts]
 * @returns {Array<{id:string, index:number, level:'error'|'warn', code:string, message:string}>}
 */
export function validateCues(cues, { fps = 30, duration = Infinity } = {}) {
  const issues = [];
  const push = (cue, level, code, message) => {
    issues.push({ id: cue.id, index: cue.index, level, code, message });
  };

  cues.forEach((cue, i) => {
    if (cue.end < cue.start) {
      push(cue, 'error', 'END_BEFORE_START', `#${cue.index} 終了時刻が開始時刻より前です`);
    } else if (cue.end === cue.start) {
      push(cue, 'warn', 'ZERO_LENGTH', `#${cue.index} 長さが0秒です`);
    } else if (cue.end - cue.start < TOO_SHORT_SEC) {
      push(cue, 'warn', 'TOO_SHORT', `#${cue.index} 長さが${TOO_SHORT_SEC}秒未満です`);
    }

    if (cue.start < 0) {
      push(cue, 'error', 'NEGATIVE_START', `#${cue.index} 開始時刻が負の値です`);
    }

    if (!(cue.text || '').trim()) {
      push(cue, 'warn', 'EMPTY_TEXT', `#${cue.index} テキストが空です`);
    }

    if (Number.isFinite(duration) && cue.end > duration) {
      push(cue, 'warn', 'BEYOND_DURATION', `#${cue.index} 動画の長さを超えています`);
    }

    if (cue.needsReview) {
      push(cue, 'warn', 'NEEDS_REVIEW', `#${cue.index} 要確認マークが付いています`);
    }

    const next = cues[i + 1];
    if (next && cue.end > next.start) {
      const overlap = cue.end - next.start;
      push(
        cue,
        'warn',
        'OVERLAP',
        `#${cue.index} と #${next.index} が${overlap.toFixed(2)}秒重なっています`
      );
    }
  });

  void fps;
  return issues;
}

/**
 * Heuristic checks for a mismatched SRT/video pairing.
 * @param {Array<object>} cues
 * @param {number} duration video duration in seconds
 * @param {{tailSec?:number}} [opts]
 * @returns {Array<{level:'warn', code:string, message:string}>}
 */
export function checkVideoPairing(cues, duration, { tailSec = 15 } = {}) {
  const warnings = [];
  if (!Number.isFinite(duration) || cues.length === 0) return warnings;

  const lastCue = cues.reduce((a, b) => (b.end > a.end ? b : a), cues[0]);
  if (lastCue.end > duration) {
    warnings.push({
      level: 'warn',
      code: 'LAST_CUE_BEYOND_DURATION',
      message: `最後の字幕（#${lastCue.index}）が動画の長さ(${duration.toFixed(2)}秒)を超えています。動画とSRTの組み合わせを確認してください`,
    });
  }

  const tailStart = duration - tailSec;
  const hasTailCue = cues.some((c) => c.end > tailStart && c.start < duration);
  if (!hasTailCue) {
    warnings.push({
      level: 'warn',
      code: 'NO_CUE_IN_TAIL',
      message: `動画の最後の${tailSec}秒間に字幕がありません。動画とSRTの組み合わせを確認してください`,
    });
  }

  return warnings;
}

/**
 * Pre-delivery check.
 * @param {Array<object>} cues
 * @param {{fps?:number, duration?:number}} [opts]
 * @returns {{ok:boolean, errors:Array<object>, warnings:Array<object>, emptyIds:string[]}}
 */
export function finalizeCheck(cues, opts = {}) {
  const issues = validateCues(cues, opts);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');
  const emptyIds = issues.filter((i) => i.code === 'EMPTY_TEXT').map((i) => i.id);
  return { ok: errors.length === 0, errors, warnings, emptyIds };
}

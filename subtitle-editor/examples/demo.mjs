#!/usr/bin/env node
/**
 * demo.mjs - end-to-end CLI demonstration of subtitle-editor-core.
 *
 * Run with: node examples/demo.mjs   (from the subtitle-editor/ directory)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseSrt,
  serializeSrt,
  validateCues,
  checkVideoPairing,
  finalizeCheck,
  createEditorStore,
  segmentsFromSilenceJson,
  mapCuesToSequence,
  sequenceDuration,
} from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const FPS = 30;
const VIDEO_DURATION = 17.0; // seconds, matches examples/sample_silence.json

function line() {
  console.log('-'.repeat(60));
}

// ---------------------------------------------------------------------
// 1. Parse the sample SRT
// ---------------------------------------------------------------------
line();
console.log('1) Parsing examples/sample.srt');
const srtPath = path.join(HERE, 'sample.srt');
const srtText = readFileSync(srtPath, 'utf8');
const { cues: parsedCues, warnings: parseWarnings } = parseSrt(srtText);
console.log(`   parsed ${parsedCues.length} cues, ${parseWarnings.length} parse warning(s)`);
for (const w of parseWarnings) console.log(`   ! ${w.message}`);

// ---------------------------------------------------------------------
// 2. Validate
// ---------------------------------------------------------------------
line();
console.log('2) Validating cues');
const issues = validateCues(parsedCues, { fps: FPS, duration: VIDEO_DURATION });
const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
console.log(`   ${errors.length} error(s), ${warns.length} warning(s)`);
for (const i of issues) console.log(`   [${i.level.toUpperCase()}] ${i.code}: ${i.message}`);

const pairingWarnings = checkVideoPairing(parsedCues, VIDEO_DURATION, { tailSec: 5 });
for (const w of pairingWarnings) console.log(`   [PAIRING] ${w.message}`);

const final = finalizeCheck(parsedCues, { fps: FPS, duration: VIDEO_DURATION });
console.log(`   finalizeCheck.ok = ${final.ok} (delivery ${final.ok ? 'ALLOWED' : 'BLOCKED'} by errors)`);
console.log(`   empty-text cue ids to delete before delivery: [${final.emptyIds.join(', ')}]`);

// ---------------------------------------------------------------------
// 3. Editing session: split / add / delete / undo / redo
// ---------------------------------------------------------------------
line();
console.log('3) Editing session (editor-store)');
const store = createEditorStore({ cues: parsedCues, fps: FPS, duration: VIDEO_DURATION });

const longCue = store.getState().cues.find((c) => c.text.includes('分割してテスト'));
console.log(`   splitting cue #${longCue.index} ("${longCue.text}") at its midpoint`);
const backId = store.split(longCue.id, {});
const afterSplit = store.getState().cues;
console.log(
  `   -> front: "${afterSplit.find((c) => c.id === longCue.id).text}" / back: "${afterSplit.find((c) => c.id === backId).text}"`
);

console.log('   adding a new cue at 17.5s with placeholder text');
const addedId = store.add(17.5, { text: '（追加されたキュー）' });
console.log(`   -> now ${store.getState().cues.length} cues`);

const emptyCue = store.getState().cues.find((c) => c.text.trim() === '' && c.id !== addedId);
if (emptyCue) {
  console.log(`   deleting empty-text cue #${emptyCue.index}`);
  store.delete(emptyCue.id);
  console.log(`   -> now ${store.getState().cues.length} cues, selected=${store.getState().selectedId}`);
}

console.log('   undo x2 (delete, then add)...');
store.undo();
store.undo();
console.log(`   -> ${store.getState().cues.length} cues (back to just after the split)`);

console.log('   redo x2 (add, then delete)...');
store.redo();
store.redo();
console.log(`   -> ${store.getState().cues.length} cues (delete + add re-applied)`);

// ---------------------------------------------------------------------
// 4. Write the corrected SRT
// ---------------------------------------------------------------------
line();
console.log('4) Writing examples/out/sample_corrected.srt');
const correctedSrt = store.toSrt({ dropEmpty: false });
writeFileSync(path.join(OUT_DIR, 'sample_corrected.srt'), correctedSrt, 'utf8');
console.log(`   wrote ${store.getState().cues.length} cues`);

// ---------------------------------------------------------------------
// 5. Sequence-time mapping using the silence/speech detection JSON
// ---------------------------------------------------------------------
line();
console.log('5) Mapping to sequence (jet-cut) time using examples/sample_silence.json');
const silenceJson = JSON.parse(readFileSync(path.join(HERE, 'sample_silence.json'), 'utf8'));

const segsPlain = segmentsFromSilenceJson(silenceJson, { fps: FPS });
console.log(`   plain cut: ${segsPlain.length} kept segment(s), sequence duration = ${sequenceDuration(segsPlain, FPS).toFixed(2)}s`);

const segsKeep1s = segmentsFromSilenceJson(silenceJson, { fps: FPS, keepSilenceSec: 1.0 });
console.log(
  `   keepSilenceSec=1.0: ${segsKeep1s.length} kept segment(s), sequence duration = ${sequenceDuration(segsKeep1s, FPS).toFixed(2)}s`
);

const finalCues = store.getState().cues;
const { cues: seqCues, warnings: seqWarnings } = mapCuesToSequence(finalCues, segsPlain, { fps: FPS });
console.log(`   mapped ${seqCues.length} cues to sequence time, ${seqWarnings.length} clamp warning(s)`);
for (const w of seqWarnings) console.log(`   ! ${w}`);

const seqSrt = serializeSrt(seqCues);
writeFileSync(path.join(OUT_DIR, 'sample_sequence.srt'), seqSrt, 'utf8');
console.log('   wrote examples/out/sample_sequence.srt (cue times in sequence/jet-cut time)');

line();
console.log('Demo complete.');

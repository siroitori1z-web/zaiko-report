import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, serializeSrt, correctedFileName } from '../src/srt.js';

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
こんにちは

2
00:00:04,000 --> 00:00:06,000
これはテストです（要確認）

3
00:00:07,000 --> 00:00:09,000
複数行の
テキストです
`;

test('parseSrt: basic parse', () => {
  const { cues, warnings } = parseSrt(SAMPLE);
  assert.equal(warnings.length, 0);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].text, 'こんにちは');
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[1].needsReview, true);
  assert.equal(cues[1].text, 'これはテストです');
  assert.equal(cues[2].text, '複数行の\nテキストです');
});

test('parseSrt: half-width review marker', () => {
  const text = `1\n00:00:01,000 --> 00:00:02,000\n注意(要確認)\n`;
  const { cues } = parseSrt(text);
  assert.equal(cues[0].needsReview, true);
  assert.equal(cues[0].text, '注意');
});

test('parseSrt: BOM + CRLF tolerated', () => {
  const withBomCrlf = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n';
  const { cues, warnings } = parseSrt(withBomCrlf);
  assert.equal(warnings.length, 0);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'Hello');
});

test('parseSrt: garbled/missing index line tolerated', () => {
  const text = `xx\n00:00:01,000 --> 00:00:02,000\nNo real index\n\n00:00:03,000 --> 00:00:04,000\nMissing index entirely\n`;
  const { cues, warnings } = parseSrt(text);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'No real index');
  assert.equal(cues[1].text, 'Missing index entirely');
});

test('parseSrt: unparsable block skipped with warning, not throw', () => {
  const text = `1\nThis is not a timecode line\nsome text\n\n2\n00:00:05,000 --> 00:00:06,000\nOK cue\n`;
  const { cues, warnings } = parseSrt(text);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'OK cue');
  assert.ok(warnings.length >= 1);
});

test('parseSrt: extra blank lines and trailing spaces tolerated', () => {
  const text = `1\n00:00:01,000 --> 00:00:02,000   \nHello   \n\n\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n`;
  const { cues } = parseSrt(text);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello');
});

test('parseSrt: stable ids via injected idGen', () => {
  let n = 100;
  const { cues } = parseSrt(SAMPLE, { idGen: () => `x${n++}` });
  assert.deepEqual(cues.map((c) => c.id), ['x100', 'x101', 'x102']);
});

test('serializeSrt: renumbers and formats times, trailing newline', () => {
  const { cues } = parseSrt(SAMPLE);
  const out = serializeSrt(cues);
  assert.ok(out.endsWith('\n'));
  assert.ok(out.startsWith('1\n00:00:01,000 --> 00:00:03,500\nこんにちは'));
  assert.ok(!out.includes('要確認')); // marker stripped, not re-added by default
});

test('serializeSrt: keepReviewMarker re-adds the marker', () => {
  const { cues } = parseSrt(SAMPLE);
  const out = serializeSrt(cues, { keepReviewMarker: true });
  assert.ok(out.includes('これはテストです（要確認）'));
});

test('serializeSrt: dropEmpty skips blank-text cues', () => {
  const cues = [
    { id: 'a', index: 1, start: 0, end: 1, text: '' },
    { id: 'b', index: 2, start: 2, end: 3, text: 'kept' },
  ];
  const out = serializeSrt(cues, { dropEmpty: true });
  assert.ok(!out.includes('\n\n1\n')); // renumbered, only one block
  assert.equal((out.match(/-->/g) || []).length, 1);
  assert.ok(out.includes('kept'));
});

test('serializeSrt: renumber=false keeps original index', () => {
  const cues = [{ id: 'a', index: 5, start: 0, end: 1, text: 'x' }];
  const out = serializeSrt(cues, { renumber: false });
  assert.ok(out.startsWith('5\n'));
});

test('round trip: parse -> serialize -> parse yields identical times/text', () => {
  const { cues: cues1 } = parseSrt(SAMPLE);
  const out = serializeSrt(cues1);
  const { cues: cues2 } = parseSrt(out);
  assert.equal(cues1.length, cues2.length);
  for (let i = 0; i < cues1.length; i++) {
    assert.equal(cues1[i].start, cues2[i].start);
    assert.equal(cues1[i].end, cues2[i].end);
    assert.equal(cues1[i].text, cues2[i].text);
  }
});

test('correctedFileName appends _corrected without doubling', () => {
  assert.equal(correctedFileName('foo.srt'), 'foo_corrected.srt');
  assert.equal(correctedFileName('foo_corrected.srt'), 'foo_corrected.srt');
  assert.equal(correctedFileName('foo'), 'foo_corrected');
  assert.equal(correctedFileName('a.b.srt'), 'a.b_corrected.srt');
});

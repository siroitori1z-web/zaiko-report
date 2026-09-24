import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FPS,
  timeToFrame,
  frameToTime,
  snapTime,
  framesToTimecode,
  timecodeToFrames,
  formatSrtTime,
  parseSrtTime,
  formatClock,
  parseFlexibleTime,
} from '../src/timecode.js';

test('DEFAULT_FPS is 30', () => {
  assert.equal(DEFAULT_FPS, 30);
});

test('timeToFrame: epsilon-tolerant floor near a boundary', () => {
  // 19.042 * 24 = 457.008 (0.33ms past the frame-457 boundary)
  assert.equal(timeToFrame(19.042, 24, 'floor'), 457);
});

test('timeToFrame: epsilon-tolerant ceil near a boundary', () => {
  // 0.0333 * 30 = 0.999 (just under 1) -> should ceil to 1, not "snap up and ceil to 2"
  assert.equal(timeToFrame(0.0333, 30, 'ceil'), 1);
});

test('timeToFrame: floating noise just above an integer does not push floor down nor ceil up an extra frame', () => {
  assert.equal(timeToFrame(1.0000001, 30, 'ceil'), 30);
  assert.equal(timeToFrame(0.9999999, 30, 'floor'), 30);
});

test('timeToFrame: modes round/nearest-boundary', () => {
  assert.equal(timeToFrame(0.5, 30, 'round'), 15);
  assert.equal(timeToFrame(0.49, 30, 'round'), 15); // 14.7 rounds to 15
  assert.equal(timeToFrame(0.5, 30, 'nearest-boundary'), 15);
});

test('timeToFrame: invalid mode throws', () => {
  assert.throws(() => timeToFrame(1, 30, 'bogus'));
});

test('timeToFrame/frameToTime round trip on exact boundaries', () => {
  for (let f = 0; f < 300; f++) {
    const t = frameToTime(f, 30);
    assert.equal(timeToFrame(t, 30, 'round'), f);
  }
});

test('snapTime snaps to nearest frame boundary', () => {
  assert.equal(snapTime(0.017, 30, 'round'), frameToTime(1, 30)); // ~1 frame
});

test('framesToTimecode: non-drop-frame basic', () => {
  assert.equal(framesToTimecode(0, { fps: 30 }), '00:00:00:00');
  assert.equal(framesToTimecode(30, { fps: 30 }), '00:00:01:00');
  assert.equal(framesToTimecode(30 * 60 * 60 + 5, { fps: 30 }), '01:00:00:05');
});

test('timecodeToFrames: non-drop-frame basic + round trip', () => {
  assert.equal(timecodeToFrames('00:00:01:00', { fps: 30 }), 30);
  for (let f = 0; f < 3000; f += 7) {
    const tc = framesToTimecode(f, { fps: 30 });
    assert.equal(timecodeToFrames(tc, { fps: 30 }), f);
  }
});

test('timecodeToFrames: MM:SS:FF shorthand (no hours field)', () => {
  // "01:02:15" as MM:SS:FF -> 1 min 2 sec + 15 frames
  assert.equal(timecodeToFrames('01:02:15', { fps: 30 }), (1 * 60 + 2) * 30 + 15);
});

test('drop-frame timecode: known boundary values (30fps)', () => {
  assert.equal(framesToTimecode(timecodeToFrames('00:09:59;29', { fps: 29.97, dropFrame: true }), { fps: 29.97, dropFrame: true }), '00:09:59;29');
  assert.equal(
    framesToTimecode(timecodeToFrames('00:09:59;29', { fps: 29.97, dropFrame: true }) + 1, { fps: 29.97, dropFrame: true }),
    '00:10:00;00'
  );
  assert.equal(
    framesToTimecode(timecodeToFrames('00:00:59;29', { fps: 29.97, dropFrame: true }) + 1, { fps: 29.97, dropFrame: true }),
    '00:01:00;02'
  );
});

test('drop-frame timecode: round trip across a wide range (30fps and 60fps)', () => {
  for (let f = 0; f < 30 * 60 * 20; f += 41) {
    const tc = framesToTimecode(f, { fps: 29.97, dropFrame: true });
    assert.equal(timecodeToFrames(tc, { fps: 29.97, dropFrame: true }), f);
  }
  for (let f = 0; f < 60 * 60 * 20; f += 67) {
    const tc = framesToTimecode(f, { fps: 59.94, dropFrame: true });
    assert.equal(timecodeToFrames(tc, { fps: 59.94, dropFrame: true }), f);
  }
});

test('drop-frame throws for non-29.97/59.94 fps', () => {
  assert.throws(() => framesToTimecode(10, { fps: 25, dropFrame: true }));
  assert.throws(() => timecodeToFrames('00:00:01;00', { fps: 25, dropFrame: true }));
});

test('formatSrtTime basic + carry', () => {
  assert.equal(formatSrtTime(0), '00:00:00,000');
  assert.equal(formatSrtTime(1.2345), '00:00:01,235'); // rounds to ms
  assert.equal(formatSrtTime(59.9996), '00:01:00,000'); // carries into minute
  assert.equal(formatSrtTime(-5), '00:00:00,000'); // negative clamped
});

test('parseSrtTime accepts , or . and 1-3 ms digits, tolerates spaces', () => {
  assert.equal(parseSrtTime(' 00:00:01,500 '), 1.5);
  assert.equal(parseSrtTime('00:00:01.5'), 1.5);
  assert.equal(parseSrtTime('00:00:01,5'), 1.5);
  assert.equal(parseSrtTime('00:00:01,50'), 1.5);
});

test('formatSrtTime/parseSrtTime round trip', () => {
  for (const t of [0, 1.001, 59.999, 3600.5, 12345.678]) {
    const s = formatSrtTime(t);
    const back = parseSrtTime(s);
    assert.ok(Math.abs(back - t) < 0.001, `${t} -> ${s} -> ${back}`);
  }
});

test('formatClock formats M:SS.mmm and M:SS+FF', () => {
  assert.equal(formatClock(65.25), '1:05.250');
  assert.equal(formatClock(1.0333, { fps: 30, frames: true }), '0:01+01');
});

test('parseFlexibleTime accepts several formats', () => {
  assert.equal(parseFlexibleTime('83.456'), 83.456);
  assert.equal(parseFlexibleTime('1:23.456'), 83.456);
  assert.ok(Math.abs(parseFlexibleTime('00:01:23,456') - 83.456) < 1e-9);
  assert.ok(Math.abs(parseFlexibleTime('00:01:23:12', { fps: 30 }) - (83 + 12 / 30)) < 1e-9);
  assert.deepEqual(parseFlexibleTime('+12f'), { relativeFrames: 12 });
  assert.deepEqual(parseFlexibleTime('-3f'), { relativeFrames: -3 });
  assert.equal(parseFlexibleTime('not a time'), null);
  assert.equal(parseFlexibleTime(''), null);
});

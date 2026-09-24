import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSaveKey,
  saveSnapshot,
  loadSnapshot,
  restoreFromLegacy,
  clearSnapshot,
} from '../src/autosave.js';

function makeMapStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test('makeSaveKey includes the fixed prefix, name and size', () => {
  const key = makeSaveKey('foo.srt', 1234);
  assert.ok(key.startsWith('subtitle-timing-editor:v1:'));
  assert.ok(key.includes('foo.srt'));
  assert.ok(key.includes('1234'));
});

test('saveSnapshot + loadSnapshot round trip', () => {
  const storage = makeMapStorage();
  const key = makeSaveKey('a.srt', 10);
  const cues = [
    { id: 'a', start: 0, end: 1, text: 'hi', needsReview: false, origStart: 0, origEnd: 1, origText: 'hi' },
  ];
  const ok = saveSnapshot(storage, key, { cues, selectedId: 'a' });
  assert.equal(ok, true);

  const loaded = loadSnapshot(storage, key);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.selectedId, 'a');
  assert.equal(loaded.cues.length, 1);
  assert.equal(loaded.cues[0].text, 'hi');
});

test('loadSnapshot returns null when nothing is stored, or on invalid JSON', () => {
  const storage = makeMapStorage();
  assert.equal(loadSnapshot(storage, 'missing-key'), null);

  storage.setItem('bad', '{not valid json');
  assert.equal(loadSnapshot(storage, 'bad'), null);
});

test('loadSnapshot drops old-format rows marked deleted:true', () => {
  const storage = makeMapStorage();
  const key = 'k';
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      cues: [
        { id: 'a', start: 0, end: 1, text: 'kept' },
        { id: 'b', start: 1, end: 2, text: 'gone', deleted: true },
      ],
    })
  );
  const loaded = loadSnapshot(storage, key);
  assert.equal(loaded.cues.length, 1);
  assert.equal(loaded.cues[0].id, 'a');
});

test('loadSnapshot recognizes the legacy array-of-patches format and restoreFromLegacy applies it', () => {
  const storage = makeMapStorage();
  const key = 'legacy';
  storage.setItem(
    key,
    JSON.stringify([
      { i: 0, text: 'patched first' },
      { i: 2, start: 99 },
      { i: 5, deleted: true }, // dropped
    ])
  );
  const loaded = loadSnapshot(storage, key);
  assert.equal(loaded.version, 'legacy');
  assert.equal(loaded.legacyPatches.length, 2);

  const base = [
    { id: 'a', start: 0, end: 1, text: 'orig0' },
    { id: 'b', start: 1, end: 2, text: 'orig1' },
    { id: 'c', start: 2, end: 3, text: 'orig2' },
  ];
  const restored = restoreFromLegacy(base, loaded.legacyPatches);
  assert.equal(restored[0].text, 'patched first');
  assert.equal(restored[1].text, 'orig1'); // untouched
  assert.equal(restored[2].start, 99);
});

test('saveSnapshot never throws when storage.setItem throws (e.g. quota exceeded)', () => {
  const throwingStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => {
    const result = saveSnapshot(throwingStorage, 'k', { cues: [] });
    assert.equal(result, false);
  });
});

test('loadSnapshot never throws when storage.getItem throws (e.g. SecurityError)', () => {
  const throwingStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.doesNotThrow(() => {
    assert.equal(loadSnapshot(throwingStorage, 'k'), null);
  });
});

test('clearSnapshot removes the key and never throws', () => {
  const storage = makeMapStorage();
  storage.setItem('k', 'v');
  assert.equal(clearSnapshot(storage, 'k'), true);
  assert.equal(storage.getItem('k'), null);

  const throwingStorage = { getItem: () => null, setItem: () => {}, removeItem: () => { throw new Error('x'); } };
  assert.equal(clearSnapshot(throwingStorage, 'k'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS,
  DEFAULT_BINDINGS,
  normalizeCombo,
  comboLabel,
  matchKey,
  findAction,
  assign,
  clearBinding,
  resetBindings,
  serializeBindings,
  deserializeBindings,
} from '../src/keybindings.js';

test('ACTIONS: every action has an id and a Japanese label, max 2 keys bound by default', () => {
  for (const a of ACTIONS) {
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.label, 'string');
    assert.ok(DEFAULT_BINDINGS[a.id].length <= 2);
  }
});

test('normalizeCombo: Ctrl and Meta are treated the same', () => {
  assert.equal(normalizeCombo({ ctrlKey: true, code: 'KeyZ' }), 'Ctrl+KeyZ');
  assert.equal(normalizeCombo({ metaKey: true, code: 'KeyZ' }), 'Ctrl+KeyZ');
});

test('normalizeCombo: modifier order is Ctrl, Alt, Shift', () => {
  assert.equal(
    normalizeCombo({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyZ' }),
    'Ctrl+Alt+Shift+KeyZ'
  );
});

test('comboLabel strips Key/Digit prefixes', () => {
  assert.equal(comboLabel('Ctrl+Shift+KeyZ'), 'Ctrl+Shift+Z');
  assert.equal(comboLabel('Ctrl+Digit1'), 'Ctrl+1');
  assert.equal(comboLabel('ArrowLeft'), 'ArrowLeft');
});

test('matchKey', () => {
  assert.equal(matchKey({ ctrlKey: true, code: 'KeyS' }, 'Ctrl+KeyS'), true);
  assert.equal(matchKey({ code: 'KeyS' }, 'Ctrl+KeyS'), false);
});

test('findAction: resolves default bindings', () => {
  assert.equal(findAction({ code: 'Space' }), 'playPause');
  assert.equal(findAction({ ctrlKey: true, code: 'KeyZ' }), 'undo');
  assert.equal(findAction({ ctrlKey: true, shiftKey: true, code: 'KeyZ' }), 'redo');
  assert.equal(findAction({ ctrlKey: true, code: 'KeyY' }), 'redo');
});

test('findAction: never matches while composing (IME)', () => {
  assert.equal(findAction({ code: 'Space', isComposing: true }), null);
});

test('findAction: inTextInput only allows combos with Ctrl/Alt', () => {
  assert.equal(findAction({ code: 'KeyN' }, DEFAULT_BINDINGS, { inTextInput: true }), null); // bare key blocked
  assert.equal(findAction({ ctrlKey: true, code: 'KeyS' }, DEFAULT_BINDINGS, { inTextInput: true }), 'save');
  assert.equal(
    findAction({ shiftKey: true, code: 'ArrowLeft' }, DEFAULT_BINDINGS, { inTextInput: true }),
    null
  ); // Shift alone still blocked in a text input
});

test('assign: sets a new combo without conflict', () => {
  const result = assign(DEFAULT_BINDINGS, 'playCue', 1, 'Ctrl+KeyP');
  assert.ok(result.bindings);
  assert.ok(result.bindings.playCue.includes('Ctrl+KeyP'));
});

test('assign: detects a conflict with another action', () => {
  const result = assign(DEFAULT_BINDINGS, 'playCue', 0, 'KeyI'); // already setIn
  assert.equal(result.error, 'conflict');
  assert.equal(result.conflictWith, 'setIn');
});

test('assign: reassigning the same slot to the same combo is not a conflict', () => {
  const result = assign(DEFAULT_BINDINGS, 'setIn', 0, 'KeyI');
  assert.ok(result.bindings);
});

test('assign: throws for unknown action or bad slot', () => {
  assert.throws(() => assign(DEFAULT_BINDINGS, 'bogusAction', 0, 'KeyQ'));
  assert.throws(() => assign(DEFAULT_BINDINGS, 'playCue', 2, 'KeyQ'));
});

test('clearBinding removes a slot', () => {
  const cleared = clearBinding(DEFAULT_BINDINGS, 'deleteCue', 1); // remove 'Backspace'
  assert.deepEqual(cleared.deleteCue, ['Delete']);
});

test('resetBindings returns a fresh, independent copy of defaults', () => {
  const reset = resetBindings();
  reset.undo.push('Extra');
  assert.equal(DEFAULT_BINDINGS.undo.length, 1); // original untouched
});

test('serializeBindings / deserializeBindings round trip', () => {
  const custom = assign(DEFAULT_BINDINGS, 'playCue', 1, 'Ctrl+KeyP').bindings;
  const str = serializeBindings(custom);
  const back = deserializeBindings(str);
  assert.deepEqual(back.playCue, custom.playCue);
});

test('deserializeBindings tolerates garbage and unknown actions, falling back to defaults per action', () => {
  const garbage = deserializeBindings('not json at all');
  assert.deepEqual(garbage, resetBindings());

  const partial = deserializeBindings(JSON.stringify({ undo: ['Ctrl+KeyU'], bogusAction: ['KeyQ'], save: 'not-an-array' }));
  assert.deepEqual(partial.undo, ['Ctrl+KeyU']);
  assert.deepEqual(partial.save, DEFAULT_BINDINGS.save); // invalid shape -> default
  assert.equal(partial.bogusAction, undefined); // unknown actions dropped
});

# subtitle-editor-core

A self-contained, dependency-free JavaScript library for SRT subtitle
timing / timecode editing. Pure ES modules, no DOM access, no globals,
deterministic (inject a clock / id generator wherever one is needed).
Meant to be dropped into an existing single-file browser app (via a
`<script type="module">` import) or used from Node scripts/tests.

## Install / run

No npm dependencies. Requires Node 22+ (for `node:test`).

```bash
cd subtitle-editor
npm test    # runs the unit test suite (node --test)
npm run demo  # end-to-end CLI demo, writes examples/out/*.srt
```

## Layout

```
src/
  timecode.js      time <-> frame <-> SMPTE timecode <-> SRT time conversions
  srt.js           parse/serialize .srt text
  cues.js          pure array operations on cue lists (sort, move, trim, split-select, ...)
  split.js         splitting one cue into two
  history.js       generic id-based undo/redo stack
  editor-store.js  stateful facade for driving a UI (the only stateful module)
  validate.js      cue-list validation + pre-delivery final check
  sequence-map.js  source-time <-> jet-cut "sequence" time mapping
  keybindings.js   data-driven keyboard shortcut table
  autosave.js      storage-agnostic autosave (localStorage or any getItem/setItem/removeItem)
  index.js         re-exports the whole public API
examples/
  demo.mjs             end-to-end CLI demo (node examples/demo.mjs)
  sample.srt           small sample SRT with intentional issues for the demo/tests
  sample_silence.json  dummy silence/speech-detector JSON for sequence-map demo
  out/                 demo output (gitignored)
test/
  *.test.js        one file per src module, run via `node --test`
```

## Integration into `subtitle_timing_editor.html`

The library is plain ESM with no bundler required. Two options:

**A. Reference the files directly** (simplest, keeps this repo as the
source of truth):

```html
<script type="module">
  import {
    parseSrt, serializeSrt, createEditorStore, validateCues,
  } from './subtitle-editor/src/index.js';

  const store = createEditorStore({ cues: [], fps: 30, duration: videoEl.duration });
  store.subscribe(({ type, state }) => render(state));
  // ... wire up your existing DOM/canvas UI to the store's methods ...
</script>
```

Note: browsers refuse `<script type="module">` imports from `file://`
pages (CORS). Option A therefore needs the page served over HTTP (e.g.
`python -m http.server`); if the editor is opened by double-clicking the
HTML file, use option B.

**B. Inline-bundle into the single file** (if the app must stay a single
`.html` with no extra files to ship): concatenate `src/*.js` with their
`import`/`export` statements stripped (each module has no dependency
cycles; the topological order is timecode -> srt/cues/split ->
history/validate/sequence-map/keybindings/autosave -> editor-store ->
index), and wrap the result in an IIFE assigned to a namespace, e.g.
`window.SubtitleEditorCore = { parseSrt, ... }`. Because every module
avoids `export *` name collisions (verified: 55 unique exported names)
this is a mechanical find/replace.

## From Node

```js
import { parseSrt, validateCues } from 'subtitle-editor-core';
// (or a relative path to src/index.js if not published as a package)
```

## Module reference

### timecode.js
- `DEFAULT_FPS` = 30 (non-drop-frame). Real 29.99842fps footage is treated
  as exactly 30 NDF; 29.97 would drift ~13 frames over 7 minutes.
- `timeToFrame(sec, fps=30, mode)` - `'floor'|'ceil'|'round'|'nearest-boundary'`.
  **Epsilon-tolerant**: a time within 1ms of a frame boundary is snapped
  onto that boundary before floor/ceil/round is applied, so millisecond
  rounding noise from SRT never walks a frame off (e.g.
  `timeToFrame(19.042, 24, 'floor') === 457` even though `19.042*24 ===
  457.008`).
- `frameToTime(frame, fps)`, `snapTime(sec, fps, mode)`.
- `framesToTimecode(frames, {fps, dropFrame})` / `timecodeToFrames(str, {fps, dropFrame})`:
  SMPTE timecode `HH:MM:SS:FF` (`;FF` for drop-frame), plus the `MM:SS:FF`
  shorthand for parsing. Drop-frame is exact SMPTE math (2 frames/min
  dropped except every 10th minute for 29.97fps, 4 for 59.94fps) and
  throws for any other fps.
- `formatSrtTime(sec)` / `parseSrtTime(str)`: SRT's `HH:MM:SS,mmm`.
- `formatClock(sec, {fps, frames})`: UI display, `M:SS.mmm` or `M:SS+FF`.
- `parseFlexibleTime(str, {fps})`: forgiving UI input parser; returns
  seconds, `{relativeFrames:n}` for `+12f`/`-3f`, or `null`.

### srt.js
`parseSrt`/`serializeSrt`/`correctedFileName`. Tolerates BOM, CRLF/CR,
garbled or missing index lines, extra blank lines, trailing spaces, and
multi-line cue text; unparsable blocks are skipped with a warning, never
thrown. The `（要確認）` / `(要確認)` marker is stripped into
`cue.needsReview` on parse and omitted on serialize unless
`keepReviewMarker: true`.

### cues.js / split.js / history.js / editor-store.js
Pure array operations, a pure cue-splitting algorithm (punctuation-aware,
surrogate-pair-safe), a generic id-based undo/redo stack, and a stateful
store that wires them together for a UI (`createEditorStore`). See the
JSDoc on each exported function for exact behavior; `editor-store.js`'s
module doc explains the drag-preview / cancel-empty-add / coalesced-typing
flows in detail.

### validate.js
`validateCues`, `checkVideoPairing` (heuristic SRT/video mismatch
detection), `finalizeCheck` (pre-delivery gate: blocks on errors, lists
empty-text rows to delete).

### sequence-map.js
Maps between original-footage ("source") time and the jet-cut
("sequence") timeline built by concatenating kept/speech segments with no
gaps. `rounding: 'outward'` (default) never trims wanted content (in =
floor, out = ceil, in frames). `keepSilenceSec` implements the confirmed
production "keep N seconds of a long cut" rule (auto-edit stage 12): a
silence gap `<= keepSilenceSec` is kept in full; a longer gap keeps
exactly `keepSilenceSec` seconds of it, split asymmetrically around the
cut via `keepTailRatio` (default `0.7`) — `keepSilenceSec * keepTailRatio`
right after the previous speech and `keepSilenceSec * (1 - keepTailRatio)`
right before the next one (e.g. keep 1.0s → 0.7s after / 0.3s before). The
same 0.7/0.3 shares apply to the video head (before the first speech —
keeps only the `(1 - keepTailRatio)` share, or the whole head gap if
shorter) and, when `videoDuration` is given, the video tail (after the
last speech — keeps only the `keepTailRatio` share, or the whole tail gap
if shorter). All splits are computed in whole frames so the total kept
length always matches `round(keepSilenceSec * fps)` exactly — see the
JSDoc in the file for the precise rule.

Boundary rules (see the JSDoc on `sourceToSequence`/`sequenceToSource` for
the full reasoning):
- A source time exactly at a kept segment's out-point (within the usual
  1ms/frame epsilon) belongs to that segment — it maps to `seqOut`, is
  never clamped, and never warns, including at the very end of the last
  segment (`sourceToSequence(last.srcOut) === sequenceDuration`).
- A source time strictly inside a cut gap always collapses to the single
  point where the sequence timeline is joined
  (`segs[i].seqOut === segs[i+1].seqIn`) — never to a frame "just inside"
  the previous segment. `direction` (`'forward'`/`'backward'`) still
  reports which edge of the gap was nearer, purely for warning wording.
- `mapCuesToSequence` keeps (rather than drops) a cue whose start and end
  both land in the same gap; since it collapses to zero length, it emits
  one combined warning instead of separate start/end ones.
- `sequenceToSource` resolves a sequence time exactly at a cut point to
  the **start of the next** segment's source time (a documented,
  deliberate choice, not the end of the previous one), while the true end
  of the whole sequence resolves to the true end of the last kept segment
  — symmetric with `sourceToSequence`'s own boundary rule.

### keybindings.js
A DOM-independent shortcut table: works with any
`{code, key, ctrlKey, metaKey, altKey, shiftKey, isComposing}`-shaped
object, so it's testable without a browser and reusable from a Node
script. Ctrl/Meta are merged into one "Ctrl" modifier.

### autosave.js
Storage-agnostic (`{getItem,setItem,removeItem}`), key-prefixed
(`subtitle-timing-editor:v1:`), never throws (quota / SecurityError become
`false`/`null`). Understands two legacy formats: an array of `{id,
deleted:true}` rows (dropped) and an array of `{i, start, end, text}`
by-index patches (`restoreFromLegacy`).

## Quality

- `npm test` runs 154 unit tests across all 11 modules (`node --test`,
  zero dependencies) — all passing.
- `npm run demo` runs an end-to-end scenario against `examples/sample.srt`
  and `examples/sample_silence.json` and writes
  `examples/out/sample_corrected.srt` and
  `examples/out/sample_sequence.srt`.
- Every `.js` file passes `node --check`.

## Known deviations / ambiguities resolved

- **`node --test test/`** (as literally specified) fails to discover
  tests in this Node v22.22.2 environment (it tries to `require()` the
  directory path itself rather than glob it — reproducible with or
  without a trailing slash). `node --test` with no path argument uses
  Node's built-in default test-file discovery (`test/**/*.test.js`) and
  works correctly, so `package.json`'s `test` script uses that form
  instead. `npm run demo` is unaffected.
- **`correctedFileName`** without a recognizable extension (e.g. `"foo"`)
  returns `"foo_corrected"` rather than inventing a `.srt` extension that
  wasn't there — only an existing extension is preserved/re-appended.
- **`sourceToSequence` inside a cut gap** always maps to the single
  sequence-time point where the two neighboring kept segments join
  (`segs[i].seqOut === segs[i+1].seqIn`) — a gap has no width in sequence
  time. `direction` (`'forward'`/`'backward'`, ties favor `'backward'`)
  only records which source-time edge was nearer, and is used solely to
  word `mapCuesToSequence`'s warning message; it no longer changes which
  frame is returned (an earlier draft did, which was a bug — see the
  regression tests in `test/sequence-map.test.js`).
- **`keepSilenceSec` / `keepTailRatio` method**: precisely, for each
  silence gap `[a,b]` between two speech segments, a gap `<=
  keepSilenceSec` is kept in full (not cut at all); a gap `>
  keepSilenceSec` keeps only `[a, a+keep*keepTailRatio]` and
  `[b-keep*(1-keepTailRatio), b]`, dropping the middle — this is the
  confirmed production rule (auto-edit stage 12), with `keepTailRatio`
  defaulting to `0.7` (an earlier draft used a symmetric `keep/2`/`keep/2`
  split; pass `keepTailRatio: 0.5` to reproduce that). The video head
  (before the first speech) keeps only the `keep*(1-keepTailRatio)` share
  right before that speech, or the whole head gap if it's shorter; the
  video tail (after the last speech, only when `videoDuration` is passed)
  keeps only the `keep*keepTailRatio` share right after it, or the whole
  tail gap if it's shorter. The after/before frame counts are computed as
  `round(keep*fps*keepTailRatio)` and `round(keep*fps) - after` (the
  complement, not independently rounded), so they always sum to exactly
  `round(keep*fps)` frames — e.g. keep=1.0s @ 24fps is 24 frames total,
  split 17/7 (`round(16.8)=17`, `24-17=7`) rather than `17` and
  `round(7.2)=7` computed independently, which isn't guaranteed to sum to
  24 in general. Adjacent kept pieces that become contiguous after outward
  frame-rounding are merged, same as any other segment.
- **`editor-store` selection after undo/redo**: if the previously
  selected cue no longer exists (e.g. undoing an `add`), selection falls
  back to another id touched by that history entry, or the first cue, or
  `null` if the list is empty.
- **`splitCue` punctuation window**: "±~30% of text length" is
  implemented as `round(length * 0.3)` characters on each side of the
  proportional split point; the nearest in-window position immediately
  after a break character wins ties by distance to the proportional
  point.
- **`assign()` conflict slots**: reassigning a combo to the exact slot it
  already occupies is not treated as a conflict with itself.

## Known limitations

- `sequence-map.js` always collapses a cut gap to its single join point;
  a production tool may instead want a per-cue policy (e.g. always push
  forward to the next segment) for cues that fall entirely inside a gap,
  rather than the fixed nearest-edge-for-warning-wording rule used here.
- `editor-store.js` does not itself call `validateCues`; the host UI is
  expected to call `validateCues`/`finalizeCheck` on `getState().cues`
  when it wants to show warnings (kept decoupled so the store stays
  focused).
- Timecode parsing (`timecodeToFrames`) accepts the ambiguous `MM:SS:FF`
  shorthand by trying the "no hours" interpretation whenever there are
  only two colon-separated components before the frame separator; a
  string like `01:02:03` is always read as `MM:SS:FF`, never `HH:MM:SS`
  with an implicit `:00` frames — pass the full `HH:MM:SS:FF` form to be
  unambiguous.

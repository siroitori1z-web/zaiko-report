/**
 * index.js - single entry point re-exporting the whole public API.
 *
 * Usage from a browser (single-file app) via a module script:
 *   <script type="module">
 *     import { parseSrt, createEditorStore } from './subtitle-editor/src/index.js';
 *   </script>
 *
 * Usage from Node:
 *   import { parseSrt } from 'subtitle-editor-core';
 */

export * from './timecode.js';
export * from './srt.js';
export * from './cues.js';
export * from './split.js';
export * from './history.js';
export * from './validate.js';
export * from './sequence-map.js';
export * from './keybindings.js';
export * from './autosave.js';
export * from './editor-store.js';

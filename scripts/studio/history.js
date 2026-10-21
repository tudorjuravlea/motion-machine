// scripts/studio/history.js: the studio's undo history. An entry holds
// the edits a gesture made and the inverse ops that undo them, so undo and redo are ordinary edits
// the caller applies. A drag's stream of single edits to one target merges into one entry.
// Pure: no node: module, no package; runs in Node and the browser.
import { sameJSON } from './json-splice.js';

// ops that set a value outright: a later one on the same target supersedes the earlier
const MERGES = new Set(['scene.duration', 'scene.order', 'scene.cut', 'scene.move', 'scene.say', 'beat.at', 'beat.out', 'beat.set', 'beat.param']);
const target = (e) => JSON.stringify([e.op, e.scene, e.beat ?? null, e.key ?? null, e.format ?? null]);
// the later edit replaces the earlier only when it sets every member the earlier set: a
// scene.cut without params after one with params would otherwise lose those params on redo
const covers = (b, a) => Object.keys(a).every((k) => Object.hasOwn(b, k));

/** An undo history: `record` an entry `{ edits, inverse, label, at }` (at in ms) after each write. */
export function createHistory({ mergeMs = 800, limit = 200 } = {}) {
  let done = [], undone = [], merging = false;
  const mergeable = (a, b) => merging && a.edits.length === 1 && b.edits.length === 1 && MERGES.has(b.edits[0].op)
    && target(a.edits[0]) === target(b.edits[0]) && covers(b.edits[0], a.edits[0]) && b.at >= a.at && b.at - a.at < mergeMs;
  return {
    record(entry) {
      const top = done[done.length - 1];
      undone = [];
      if (top && mergeable(top, entry)) {
        // a drag that ends where it began leaves nothing to undo, and the next edit starts afresh
        if (sameJSON(entry.edits, top.inverse)) { done.pop(); merging = false; return; }
        done[done.length - 1] = { ...entry, inverse: top.inverse };
      } else { done.push(entry); if (done.length > limit) done = done.slice(done.length - limit); }
      merging = true;
    },
    undo() { const e = done.pop() ?? null; if (e) undone.push(e); merging = false; return e; },
    redo() { const e = undone.pop() ?? null; if (e) done.push(e); merging = false; return e; },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    entries: () => [...done],
    clear() { done = []; undone = []; merging = false; },
  };
}

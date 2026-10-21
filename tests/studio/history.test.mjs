// The undo history. Entries hold edits and their
// inverse; undo hands back the entry whose inverse to apply, redo the one whose edits to apply.
// A drag's stream of edits to one target merges into one entry; a new edit clears redo; the
// stack keeps at most `limit` entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../scripts/studio/history.js';

const at = (beat, value, old, t, extra = {}) => ({ edits: [{ op: 'beat.at', scene: 'hook', beat, value, ...extra }], inverse: [{ op: 'beat.at', scene: 'hook', beat, value: old, ...extra }], label: `move beat ${beat}`, at: t });

test('undo returns the entry whose inverse to apply, redo the entry whose edits to apply', () => {
  const h = createHistory();
  assert.equal(h.canUndo(), false); assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), null); assert.equal(h.redo(), null);
  const a = at(0, 1, 0, 0), b = at(1, 2, 1, 5000);
  h.record(a); h.record(b);
  assert.deepEqual(h.entries(), [a, b]);
  assert.equal(h.undo(), b);
  assert.equal(h.canRedo(), true);
  assert.equal(h.undo(), a);
  assert.equal(h.canUndo(), false);
  assert.equal(h.redo(), a);
  assert.equal(h.redo(), b);
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.entries(), [a, b]);
});

test('record clears the redo stack', () => {
  const h = createHistory();
  h.record(at(0, 1, 0, 0)); h.record(at(1, 2, 1, 5000));
  h.undo();
  assert.equal(h.canRedo(), true);
  const c = at(2, 3, 2, 9000);
  h.record(c);
  assert.equal(h.canRedo(), false);
  assert.equal(h.redo(), null);
  assert.equal(h.entries().at(-1), c);
});

test('two single-edit entries on one target within mergeMs merge: the older inverse, the newer edits', () => {
  const h = createHistory({ mergeMs: 800 });
  h.record(at(0, 1.1, 1, 1000));
  h.record(at(0, 1.2, 1.1, 1500));
  h.record(at(0, 1.3, 1.2, 2100));   // 600 ms after the last: still the same drag
  assert.equal(h.entries().length, 1);
  const [e] = h.entries();
  assert.deepEqual(e.edits, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1.3 }]);
  assert.deepEqual(e.inverse, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1 }]);
  assert.equal(e.at, 2100);
  assert.equal(h.undo(), e);
});

test('entries do not merge across targets, formats, ops, gaps, batches, adds, or an undo', () => {
  const cases = [
    [at(0, 1, 0, 0), at(0, 2, 1, 800)],                                         // 800 ms: not less than mergeMs
    [at(0, 1, 0, 0), at(1, 2, 1, 100)],                                         // another beat
    [at(0, 1, 0, 0, { format: '9x16' }), at(0, 2, 1, 100)],                     // another format
    [at(0, 1, 0, 0), { ...at(0, 2, 1, 100), edits: [{ op: 'beat.out', scene: 'hook', beat: 0, value: 2 }] }],   // another op
    [{ ...at(0, 1, 0, 0), edits: [{ op: 'beat.param', scene: 'hook', beat: 0, key: 'd', value: 1 }] }, { ...at(0, 1, 0, 100), edits: [{ op: 'beat.param', scene: 'hook', beat: 0, key: 'side', value: 'up' }] }],   // another key
    [at(0, 1, 0, 0), { ...at(0, 2, 1, 100), edits: [at(0, 2, 1, 0).edits[0], at(1, 2, 1, 0).edits[0]] }],    // a batch
    [{ edits: [{ op: 'beat.add', scene: 'hook', beat: { at: 0, slot: 's', fx: 'entrances/fade' } }], inverse: [{ op: 'beat.remove', scene: 'hook', beat: 2 }], label: 'add', at: 0 },
      { edits: [{ op: 'beat.add', scene: 'hook', beat: { at: 0, slot: 's', fx: 'entrances/fade' } }], inverse: [{ op: 'beat.remove', scene: 'hook', beat: 3 }], label: 'add', at: 100 }],
  ];
  for (const [a, b] of cases) {
    const h = createHistory({ mergeMs: 800 });
    h.record(a); h.record(b);
    assert.equal(h.entries().length, 2, JSON.stringify([a.edits, b.edits]));
  }
  const h = createHistory();
  h.record(at(0, 1, 0, 0)); h.record(at(1, 1, 0, 2000)); h.undo();
  h.record(at(0, 2, 1, 2100));   // the top is now beat 0's entry, but an undo came between
  assert.equal(h.entries().length, 2);
});

const cut = (params, t, old = {}) => ({ edits: [{ op: 'scene.cut', scene: 'p', pattern: 'transitions/push', ...params }], inverse: [{ op: 'scene.cut', scene: 'p', pattern: null, ...old }], label: 'cut', at: t });

test('an edit merges only into one whose members it all sets, so redo never loses the earlier edit', () => {
  const h = createHistory({ mergeMs: 800 });
  h.record(cut({ params: { direction: 'left' } }, 0, { params: null }));
  h.record(cut({}, 100));   // sets the pattern only: cutParams from the first edit would be lost
  assert.equal(h.entries().length, 2);
  const g = createHistory({ mergeMs: 800 });
  g.record(cut({}, 0));
  g.record(cut({ params: null }, 100));   // sets every member the first did, and more
  assert.equal(g.entries().length, 1);
  assert.deepEqual(g.entries()[0].inverse, cut({}, 0).inverse);
});

test('a drag that ends where it began leaves no entry and closes the merge window; a clock going back does not merge', () => {
  const h = createHistory({ mergeMs: 800 });
  h.record(at(0, 5, 1, 0));                 // an earlier, separate gesture
  h.record(at(0, 1.5, 1, 5000));
  h.record(at(0, 1, 1.5, 5100));            // back to 1, where the drag began
  assert.equal(h.entries().length, 1);
  h.record(at(0, 2, 1, 5200));              // a new gesture, not merged into the first entry
  assert.equal(h.entries().length, 2);
  assert.deepEqual(h.entries()[1].inverse, at(0, 2, 1, 0).inverse);
  const b = createHistory({ mergeMs: 800 });
  b.record(at(0, 1, 0, 1000)); b.record(at(0, 2, 1, 0));
  assert.equal(b.entries().length, 2);
  const lone = createHistory();
  lone.record(at(0, 1, 0, 0)); lone.record(at(0, 0, 1, 100));
  assert.equal(lone.canUndo(), false);
});

test('the stack keeps at most `limit` entries, dropping the oldest', () => {
  const h = createHistory({ limit: 3 });
  const es = [0, 1, 2, 3, 4].map((i) => at(i, 1, 0, i * 5000));
  for (const e of es) h.record(e);
  assert.deepEqual(h.entries(), es.slice(2));
  assert.equal(h.undo(), es[4]); assert.equal(h.undo(), es[3]); assert.equal(h.undo(), es[2]);
  assert.equal(h.canUndo(), false);
});

test('clear empties both stacks', () => {
  const h = createHistory();
  h.record(at(0, 1, 0, 0)); h.record(at(1, 1, 0, 5000)); h.undo();
  h.clear();
  assert.equal(h.canUndo(), false); assert.equal(h.canRedo(), false); assert.deepEqual(h.entries(), []);
});

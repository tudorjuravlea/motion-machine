// text/garden's `text: type`, in Node: the line is typed letter by letter across the first
// `typeShare` of the entrance, and every plant starts growing only once the letter it roots on is
// there, while every window still ends by p = 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settingsOf, typeReveal, typedWindows } from '../../patterns/text/garden/pattern.js';

const set = (params) => settingsOf({ params });

test('text: type parses next to fade and present, and typeShare is checked and defaulted', () => {
  assert.equal(set({ text: 'type' }).text, 'type');
  assert.equal(set({ text: 'present' }).text, 'present');
  assert.equal(set({ text: 'fade' }).text, 'fade');
  assert.equal(set({ text: 'typed' }).text, 'fade');
  assert.equal(set({}).typeShare, 0.5);
  assert.equal(set({ typeShare: 0.3 }).typeShare, 0.3);
  assert.equal(set({ typeShare: 3 }).typeShare, 0.9);
  assert.equal(set({ typeShare: 0 }).typeShare, 0.1);
  assert.equal(set({ typeShare: 'x' }).typeShare, 0.5);
});

test('each letter is revealed in reading order, one after another, all of them by typeShare', () => {
  for (const [n, share] of [[1, 0.5], [16, 0.5], [16, 0.3], [40, 0.8]]) {
    const r = typeReveal(n, share);
    assert.equal(r.length, n);
    assert.ok(r[0].at >= 0, 'starts at or after the entrance');
    for (let j = 0; j < n; j++) {
      assert.ok(r[j].done > r[j].at, `${n}/${share}: letter ${j} takes a moment to show`);
      if (j) {
        assert.ok(r[j].at >= r[j - 1].done, `${n}/${share}: letter ${j} starts after letter ${j - 1} is whole`);
        assert.ok(r[j].at > r[j - 1].at, `${n}/${share}: monotone`);
      }
    }
    assert.ok(r.at(-1).done <= share + 1e-12, `${n}/${share}: the last letter is whole by ${share} (${r.at(-1).done})`);
    assert.ok(r.at(-1).done >= share * 0.9, `${n}/${share}: typing fills its share`);
  }
  assert.deepEqual(typeReveal(16, 0.5), typeReveal(16, 0.5), 'pure');
});

// a few plants in the garden's own clock (seconds), each rooted on a letter
const garden = () => [
  { id: 1, letter: 0, t0: 0.12, dur: 1.1 }, { id: 1, letter: 0, t0: 0.9, dur: 0.45 }, { id: 1, letter: 0, t0: 1.2, dur: 0.75 },
  { id: 2, letter: 5, t0: 0.4, dur: 1.3 }, { id: 2, letter: 5, t0: 1.7, dur: 1.5 },
  { id: 3, letter: 11, t0: 0.9, dur: 0.8 }, { id: 3, letter: 11, t0: 1.6, dur: 0.75 },
  { id: 4, letter: 15, t0: 1.1, dur: 1.4 }, { id: 4, letter: 15, t0: 2.4, dur: 1.1 },
];

test('every plant starts no earlier than its letter is whole, keeps its own order and ends by p = 1', () => {
  for (const share of [0.3, 0.5, 0.8]) {
    const r = typeReveal(16, share), els = garden();
    typedWindows(els, (j) => r[j].done);
    for (const e of els) {
      assert.ok(e.s >= r[e.letter].done - 1e-12, `share ${share}: plant ${e.id} starts at ${e.s}, its letter at ${r[e.letter].done}`);
      assert.ok(e.e > e.s && e.e <= 1 + 1e-12, `share ${share}: window [${e.s}, ${e.e}]`);
    }
    // within a plant the windows keep the order and the proportions of the garden's clock
    for (const id of [1, 2, 3, 4]) {
      const p = els.filter((e) => e.id === id), k = (p[0].e - p[0].s) / p[0].dur;
      for (const e of p) assert.ok(Math.abs((e.e - e.s) / e.dur - k) < 1e-9, `plant ${id} grows at one speed`);
      for (let i = 1; i < p.length; i++) assert.ok(Math.abs((p[i].s - p[0].s) - (p[i].t0 - p[0].t0) * k) < 1e-9, `plant ${id} keeps its order`);
    }
    // the last plant, on the last letter, ends exactly at p = 1: nothing is left unused
    assert.ok(Math.abs(Math.max(...els.map((e) => e.e)) - 1) < 1e-9, `share ${share}: the garden ends at p = 1`);
  }
});

test('an element on no letter (a bed) keeps the garden\'s own mapping onto the entrance', () => {
  const els = [{ id: 1, t0: 0.2, dur: 1 }, { id: 2, t0: 0.6, dur: 2 }];
  typedWindows(els, () => 0.4);
  assert.ok(Math.abs(els[0].s - (0.06 + 0.2 * 0.94 / 2.6)) < 1e-9);
  assert.ok(Math.abs(els[1].e - 1) < 1e-9);
});

test('the card lists text type and typeShare', () => {
  const card = readFileSync(join(import.meta.dirname, '../../patterns/text/garden/PATTERN.md'), 'utf8');
  assert.match(card, /\| `text` \| enum\(fade\|present\|type\)/);
  assert.match(card, /\| `typeShare` \| number \| 0\.5 \|/);
});

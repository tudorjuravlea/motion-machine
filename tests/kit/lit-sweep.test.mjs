// text/lit-sweep, the maths: a reading cursor travels the block. Each word sits at a place on the
// reading path (lines top to bottom, words in reading order, by width); the cursor crosses the
// whole path on the entrance's easing; a word's light ramps across a band of half-width `soft`
// around the cursor; the unlit tone is a colour mix of ink into the canvas at `floor`, so every word
// is readable from the first frame and nothing is ever transparent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import SWEEP, { placesOf, cursorAt, lightAt, toneOf, edgeOf, settingsOf } from '../../patterns/text/lit-sweep/pattern.js';

// three lines of words, widths in px, in reading order
const WORDS = [
  { line: 0, w: 120 }, { line: 0, w: 60 }, { line: 0, w: 200 },
  { line: 1, w: 90 }, { line: 1, w: 150 },
  { line: 2, w: 40 },
];
const TOTAL = WORDS.reduce((s, x) => s + x.w, 0);

test('each word sits at the middle of its own width along the reading path', () => {
  const q = placesOf(WORDS);
  assert.equal(q.length, WORDS.length);
  let before = 0;
  WORDS.forEach((x, i) => { assert.ok(Math.abs(q[i] - (before + x.w / 2) / TOTAL) < 1e-12, `word ${i}`); before += x.w; });
  for (let i = 1; i < q.length; i++) assert.ok(q[i] > q[i - 1], 'places rise in reading order');
  assert.ok(q[0] > 0 && q.at(-1) < 1);
});

test('the reading path runs line by line even when words are listed out of order', () => {
  const shuffled = [WORDS[3], WORDS[0], WORDS[5], WORDS[1], WORDS[4], WORDS[2]];
  const q = placesOf(shuffled);
  // the word of line 2 is last on the path, the first word of line 0 first
  assert.equal(Math.max(...q), q[2]);
  assert.equal(Math.min(...q), q[1]);
});

test('the cursor starts a half band before the path and ends a half band past it', () => {
  const ease = (x) => x;
  assert.equal(cursorAt(0, 0.12, ease), -0.12);
  assert.ok(Math.abs(cursorAt(1, 0.12, ease) - 1.12) < 1e-12);
  assert.ok(Math.abs(cursorAt(0.5, 0.2, ease) - 0.5) < 1e-12);
});

test('a word is dark until the band reaches it, full once the band has passed, and only brightens', () => {
  const h = 0.12, lin = (x) => x;
  for (const q of placesOf(WORDS)) {
    assert.equal(lightAt(cursorAt(0, h, lin), q, h, lin), 0, 'unlit at p = 0');
    assert.equal(lightAt(cursorAt(1, h, lin), q, h, lin), 1, 'lit at p = 1');
    let last = 0;
    for (let i = 0; i <= 200; i++) {
      const L = lightAt(cursorAt(i / 200, h, lin), q, h, lin);
      assert.ok(L >= last - 1e-12, 'never dims');
      last = L;
    }
  }
  assert.equal(lightAt(0.5, 0.5, 0.1, lin), 0.5, 'the cursor on a word lights it half way');
});

test('the light passes through the style easing, not a fixed curve', () => {
  const sq = (x) => x * x;
  assert.equal(lightAt(0.5, 0.5, 0.1, sq), 0.25);
});

test('the tone runs from the floor to full ink; the accent edge peaks mid-band and is zero at both ends', () => {
  assert.equal(toneOf(0, 30), 30);
  assert.equal(toneOf(1, 30), 100);
  assert.equal(toneOf(0.5, 20), 60);
  assert.equal(edgeOf(0), 0); assert.equal(edgeOf(1), 0); assert.equal(edgeOf(0.5), 1);
});

test('params are bounded: floor 15 to 60 (default 30), soft 0.04 to 0.4 (default 0.12), edge none or accent', () => {
  assert.deepEqual(settingsOf({}), { floor: 30, soft: 0.12, edge: 'none' });
  assert.deepEqual(settingsOf({ floor: 2, soft: 9, edge: 'accent' }), { floor: 15, soft: 0.4, edge: 'accent' });
  assert.deepEqual(settingsOf({ floor: 99, soft: 0, edge: 'red' }), { floor: 60, soft: 0.04, edge: 'none' });
});

test('the module is a text pattern on the hold role with floor, soft and edge params', () => {
  assert.equal(SWEEP.name, 'lit-sweep');
  assert.equal(SWEEP.group, 'text');
  assert.equal(SWEEP.dur, 'hold');
  for (const k of ['floor', 'soft', 'edge']) assert.ok(k in SWEEP.params, k);
  assert.equal(SWEEP.params.floor.default, 30);
  assert.equal(SWEEP.params.soft.default, 0.12);
});

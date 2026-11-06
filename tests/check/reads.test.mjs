// W-READS (SPEC §7): too much at once. More than five arrivals inside one 1.3 s window warns; the children of one cascade count once.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { READS_MAX, WINDOW_S, peakArrivals } from '../../scripts/check/W-READS.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-READS'] };
const check = async (dir) => row(await run(dir, only), 'W-READS');
const beat = (at, slot, text = 'Word', extra = {}) => ({ at, slot, fx: 'entrances/fade', text, params: {}, ...extra });
const SLOTS = ['kicker', 'headline', 'sub', 'note'];
/** Scene 1: four arrivals in 0.3 s; scene 2 follows at 1.0 s with three: seven inside 1.3 s. */
const crowded = ({ story }) => {
  story.scenes.length = 2;
  scene(story, 'open').duration = 1;
  scene(story, 'open').beats = SLOTS.map((s, i) => beat(i * 0.1, s));
  scene(story, 'style').duration = 4;
  scene(story, 'style').beats = SLOTS.slice(0, 3).map((s, i) => beat(i * 0.1, s));
};

test('the limits are five arrivals in 1.3 s', () => { assert.equal(READS_MAX, 5); assert.equal(WINDOW_S, 1.3); });

test('peakArrivals counts the most arrivals inside one window, the window inclusive of both ends', () => {
  assert.deepEqual(peakArrivals([0, 0.5, 1.3, 2.6], 1.3), { count: 3, from: 0 });
  assert.deepEqual(peakArrivals([0, 1.31], 1.3), { count: 1, from: 0 });
  assert.deepEqual(peakArrivals([], 1.3), { count: 0, from: 0 });
});

test('seven arrivals inside 1.3 s warn, naming the window and the count', async () => {
  const r = await check(variant('_base/film', crowded));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 7);
  assert.equal(r.evidence.threshold, 5);
  assert.equal(r.evidence.windowS, 1.3);
  assert.match(r.evidence.reason, /7 arrivals inside 1.3 s from 0 s/);
});

test('arrivals spread over the film pass and the pass says how many it read', async () => {
  const r = await check('_base/film');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.arrivals, 10);
  assert.equal(r.evidence.measured, 2);
});

test('the children of one cascade are one arrival', async () => {
  const r = await check(variant('_base/film', ({ story }) => {
    story.scenes.length = 1;
    scene(story, 'open').beats = [beat(0, 'headline', 'a|b|c|d|e|f|g|h', { params: { each: true } }), beat(0.1, 'sub', 'Then one more.')];
  }));
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.equal(r.evidence.arrivals, 2);
  assert.equal(r.evidence.measured, 2);
});

test('a style\'s gate.readsMax and gate.readsWindowS set the limits and the evidence says so', async () => {
  const lax = await check(variant('_base/film', (v) => { crowded(v); v.style.gate = { readsMax: 7 }; }));
  assert.equal(lax.status, 'PASS');
  assert.equal(lax.evidence.threshold, 7);
  const narrow = await check(variant('_base/film', (v) => { crowded(v); v.style.gate = { readsWindowS: 0.5 }; }));
  assert.equal(narrow.status, 'PASS', 'four arrivals fall in 0.5 s');
  assert.equal(narrow.evidence.windowS, 0.5);
});

test('a deck is a SKIP', async () => assert.match((await check('_base/deck')).evidence.reason, /deck/));

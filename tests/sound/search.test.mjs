// scripts/lib/sound-search.mjs: the evolution strategy `mm sound clone` searches with. Elites mutated with a shrinking step plus a few
// fresh draws, after a cheap model-free prescreen of more candidates than are scored in full. Seeded and deterministic. Checked on
// a function whose best point is known, then on the cloning of a sound (tests/sound/clone.test.mjs and clone-search.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evolve, gaussian, mulberry, streamOf } from '../../scripts/lib/sound-search.mjs';

const D = 12;
const target = Array.from({ length: D }, (_, i) => 0.15 + 0.06 * i);
const cost = (u) => Math.sqrt(u.reduce((s, v, i) => s + (v - target[i]) ** 2, 0));
const make = (u) => ({ u, pre: cost(u) });

test('the generator and the unit stream are the same every time', () => {
  const a = mulberry(5), b = mulberry(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const s = streamOf([0.1, 0.2]);
  assert.deepEqual([s(), s(), s()], [0.1, 0.2, 0.1], 'the stream wraps');
  const g = mulberry(1);
  const xs = Array.from({ length: 4000 }, () => gaussian(g));
  const mean = xs.reduce((p, v) => p + v, 0) / xs.length, sd = Math.sqrt(xs.reduce((p, v) => p + (v - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.08 && Math.abs(sd - 1) < 0.08, `${mean} ${sd}`);
});

test('the search lands nearer a known best point than the same number of random draws', () => {
  let wins = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const r = mulberry(seed * 977), random = Math.min(...Array.from({ length: 64 }, () => cost(Array.from({ length: D }, () => r()))));
    const es = evolve({ dims: D, budget: 64, pop: 16, elite: 4, prescreen: 32, seed, make });
    assert.equal(es.history.length, 64, 'the budget counts the candidates scored in full');
    if (es.best.total < random) wins++;
  }
  assert.ok(wins >= 4, `the search won ${wins} of 5`);
});

test('the same seed gives the same search; another seed another', () => {
  const run = (seed) => evolve({ dims: D, budget: 32, pop: 8, prescreen: 16, seed, make }).history.map((h) => h.total.toFixed(9)).join();
  assert.equal(run(3), run(3));
  assert.notEqual(run(3), run(4));
});

test('the prescreen ranks more candidates than are scored: the full score is spent on the best ones', () => {
  let made = 0, scored = 0;
  const res = evolve({ dims: D, budget: 32, pop: 8, prescreen: 24, seed: 2, make: (u) => { made++; return make(u); }, full: (c) => { scored++; return c.pre; } });
  assert.equal(scored, 32);
  assert.equal(made, 24 * 4);
  assert.ok(res.generations === 4);
});

test('candidates the build rejects (a pre of Infinity) are never scored', () => {
  let scored = 0;
  const res = evolve({ dims: 2, budget: 8, pop: 4, prescreen: 8, seed: 1, make: (u) => ({ u, pre: u[0] < 0.5 ? Infinity : u[0] }), full: (c) => { scored++; assert.ok(c.u[0] >= 0.5); return c.pre; } });
  assert.ok(scored > 0 && res.history.every((h) => Number.isFinite(h.total)));
});

test('the step shrinks over the generations', () => {
  const res = evolve({ dims: D, budget: 64, pop: 16, prescreen: 16, seed: 1, make, sigma0: 0.3, sigma1: 0.03 });
  assert.ok(res.sigmas[0] > res.sigmas.at(-1) && Math.abs(res.sigmas[0] - 0.3) < 1e-9 && Math.abs(res.sigmas.at(-1) - 0.03) < 1e-9);
});

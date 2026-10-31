// transitions/impact: a hit at the cut. Before the hit only the outgoing scene is drawn, building; at the
// hit the incoming scene replaces it, punched in and shaking, with a colour fringe at its peak; all
// three settle by the end of the cut. `frameAt` is the pure part: the picture at a point in the cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import impact, { frameAt } from '../../patterns/transitions/impact/pattern.js';

const ease = (name, p) => (name === 'enter' ? 1 - (1 - p) ** 3 : p);
const prm = (o = {}) => ({ strength: 0.6, shake: 0.6, fringe: 0.6, hit: 0.3, ...o });
const at = (q, o) => frameAt(q, prm(o), { ease, d: 0.4, short: 1080, seed: 7 });

test('only one scene is ever drawn: the outgoing one before the hit, the incoming one from it', () => {
  assert.equal(at(0.1).shows, 'from');
  assert.equal(at(0.29).shows, 'from');
  assert.equal(at(0.3).shows, 'to');
  assert.equal(at(0.9).shows, 'to');
});

test('it starts as the outgoing scene at rest and ends as the incoming scene at rest', () => {
  const a = at(0);
  assert.deepEqual([a.scale, a.dx, a.dy, a.fringe], [1, 0, 0, 0]);
  const z = at(1);
  assert.equal(z.scale, 1);
  assert.equal(z.fringe, 0);
  assert.ok(Math.abs(z.dx) < 1e-9 && Math.abs(z.dy) < 1e-9);
});

test('the punch, the shake and the fringe all peak at the cut and settle by the end of it', () => {
  const peak = at(0.3), before = at(0.29), after = at(0.31);
  assert.ok(peak.scale > 1.05 && peak.scale <= 1.12 + 1e-9, `punch ${peak.scale}`);
  assert.ok(peak.scale > at(0.29).scale, 'the punch jumps at the cut');
  assert.ok(Math.abs(peak.fringe - 1) < 1e-9 && before.fringe < 1 && after.fringe < 1, 'the fringe peaks at the cut');
  assert.ok(Math.hypot(peak.dx, peak.dy) > 0.5, 'the shake is on at the hit');
  for (let q = 0.31; q < 1; q += 0.1) {
    const f = at(q), g = at(q + 0.1);
    assert.ok(g.scale <= f.scale + 1e-9, `the punch only settles: ${q}`);
    assert.ok(g.fringe <= f.fringe + 1e-9, `the fringe only settles: ${q}`);
  }
  assert.ok(at(0.95).scale < 1.005);
});

test('the shake decays and never pulls the scene off the frame: the offset stays inside the zoom margin', () => {
  for (let q = 0.3; q <= 1; q += 0.02) {
    const f = at(q, { strength: 1, shake: 1 });
    const margin = (f.scale - 1) * 540;
    assert.ok(Math.abs(f.dx) <= margin + 1e-6 && Math.abs(f.dy) <= margin + 1e-6, `q ${q}: ${f.dx}, ${f.dy} against ${margin}`);
  }
  const early = Math.hypot(at(0.32, { strength: 1, shake: 1 }).dx, at(0.32, { strength: 1, shake: 1 }).dy);
  assert.ok(early > 1, 'a hit that moves');
});

test('seeded: the same seed gives the same frame, another seed another path; no state between calls', () => {
  const a = frameAt(0.4, prm(), { ease, d: 0.4, short: 1080, seed: 7 }), b = frameAt(0.4, prm(), { ease, d: 0.4, short: 1080, seed: 7 });
  assert.deepEqual(a, b);
  const c = frameAt(0.4, prm(), { ease, d: 0.4, short: 1080, seed: 8 });
  assert.notEqual(a.dx, c.dx);
  frameAt(0.9, prm(), { ease, d: 0.4, short: 1080, seed: 7 });
  assert.deepEqual(frameAt(0.4, prm(), { ease, d: 0.4, short: 1080, seed: 7 }), a);
});

test('strength scales the hit, and shake 0 and fringe 0 switch those two off', () => {
  assert.ok(at(0.3, { strength: 1 }).scale > at(0.3, { strength: 0.3 }).scale);
  assert.equal(at(0.3, { strength: 0 }).scale, 1);
  const s = at(0.35, { shake: 0 });
  assert.equal(s.dx, 0); assert.equal(s.dy, 0);
  assert.equal(at(0.3, { fringe: 0 }).fringe, 0);
});

test('the module is a quick transition with its params named', () => {
  assert.equal(impact.name, 'impact');
  assert.equal(impact.group, 'transitions');
  assert.ok(['quick', 'standard', 'slow'].includes(impact.dur));
  for (const k of ['strength', 'fringe', 'shake', 'hit']) assert.ok(impact.params[k], k);
});

// The particle emitter's closed forms (runtime/kit/emit.js) and its opt-in (G-PATTERN-REF): a burst is
// a pure function of its seconds, keeps to its window, its budget and its roles, fades beside type, and
// a story that names an emitter fails the gate unless the brand has a `particles` block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { EMIT_LIMIT, EMIT_DEFAULTS, u01, seedOf, particlesOf, burstAt, admitted, clearOf, onPerimeter } from '../../runtime/kit/emit.js';
import { ROOT } from '../../scripts/lib/browser.mjs';

const color = { canvas: '#0b0d12', ink: '#f2f2f5', muted: '#8a8f99', surface: '#16181f', line: '#2a2d36', accent: '#d4ff3a', accentInk: '#0b0d12' };
const spec = (extra = {}) => ({ seed: 7, count: 30, origin: (u) => [500, 500, 0, -1], spread: 0.5, speed: [400, 800], gravity: 900, drag: 2, life: [0.4, 0.9], size: [6, 12], spin: [-4, 4], stagger: 0.05, roles: 2, window: 1, ...extra });

test('u01 is a fixed value in [0, 1) of seed, index and slot, and a new slot changes no other', () => {
  const a = [];
  for (let i = 0; i < 2000; i++) { const v = u01(11, i, 3); assert.ok(v >= 0 && v < 1); a.push(v); }
  assert.equal(u01(11, 5, 3), a[5]);
  assert.notEqual(u01(11, 5, 4), u01(11, 5, 3));
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `mean ${mean}`);
  assert.equal(seedOf('a'), seedOf('a')); assert.notEqual(seedOf('a'), seedOf('b'));
});

test('a brand without a particles block has the emitter off; one with it gets its roles, clamped to the limits', () => {
  assert.equal(particlesOf({ color }), null);
  assert.equal(particlesOf({ color, particles: { roles: ['gold'] } }), null);
  assert.deepEqual(particlesOf({ color, particles: { roles: ['accent', 'line'] } }), { roles: ['accent', 'line'], max: EMIT_DEFAULTS.max, area: EMIT_DEFAULTS.area });
  assert.deepEqual(particlesOf({ color, particles: { roles: ['accent'], max: 500, area: 0.5 } }), { roles: ['accent'], max: EMIT_LIMIT.count, area: EMIT_LIMIT.area });
});

test('a burst is a pure function of its seconds: the same instant twice, in any order, gives the same particles', () => {
  const at = [0.31, 0.02, 0.77, 0.31];
  const runs = at.map((a) => JSON.stringify(burstAt(a, spec())));
  assert.equal(runs[0], runs[3]);
  assert.ok(burstAt(0.31, spec()).length > 0);
  assert.deepEqual(burstAt(-0.01, spec()), []);
});

test('every particle dies inside 95 % of the window, so a rest holds none; it fades out at the end of its life', () => {
  assert.deepEqual(burstAt(0.95, spec()), []);
  assert.deepEqual(burstAt(5, spec({ life: [4, 5], window: 0.5 })), []);
  for (const a of [0.1, 0.4, 0.8]) for (const p of burstAt(a, spec())) assert.ok(p.alpha >= 0 && p.alpha <= 1 && p.q >= 0 && p.q < 1);
});

test('gravity and drag in closed form: with no drag a particle follows the parabola; with drag it never passes v/k', () => {
  const one = (o) => burstAt(0.5, { ...spec(o), count: 1, stagger: 0, spread: 0, life: [1, 1], speed: [100, 100], window: 2 })[0];
  const free = one({ drag: 0, gravity: 200 });
  assert.ok(Math.abs(free.x - 500) < 1e-9);
  assert.ok(Math.abs(free.y - (500 - 100 * 0.5 + 0.5 * 200 * 0.25)) < 1e-9);
  const held = one({ drag: 3, gravity: 0 });
  assert.ok(500 - held.y < 100 / 3 && 500 - held.y > 0);
});

test('each particle takes one of the brand\'s roles, by seed', () => {
  const roles = new Set(burstAt(0.2, spec({ count: 60 })).map((p) => p.role));
  assert.deepEqual([...roles].sort(), [0, 1]);
});

test('the budget admits particles in index order up to the count, the brand\'s max and the area share', () => {
  const frame = [1000, 1000];
  assert.equal(admitted(50, { max: 40, area: 1, frame, peakArea: () => 1 }), 40);
  assert.equal(admitted(50, { max: 64, area: 0.001, frame, peakArea: () => 100 }), 10);
  assert.equal(admitted(5, { max: 64, area: 1, frame, peakArea: () => 1 }), 5);
});

test('a particle is invisible over type and fades back in over the band beside it', () => {
  const box = [[100, 100, 200, 50]];
  assert.equal(clearOf(200, 120, box, 4, 20), 0);
  assert.equal(clearOf(200, 100 - 4 - 10, box, 4, 20), 0.5);
  assert.equal(clearOf(200, 0, box, 4, 20), 1);
});

test('a point on a box\'s edge carries the outward direction there', () => {
  assert.deepEqual(onPerimeter([0, 0, 10, 20], 0.1, 2), [6, -2, 0, -1]);
  assert.deepEqual(onPerimeter([0, 0, 10, 20], 0.4, 2), [12, 14, 1, 0]);
});

test('G-PATTERN-REF fails a story that names an emitter when the brand has no particles block, and passes with one', async () => {
  const { default: refRule } = await import('../../scripts/check/G-PATTERN-REF.mjs');
  const dir = join(ROOT, 'patterns', 'emphasis', 'sparks', 'demo');
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const { default: sparks } = await import('../../patterns/emphasis/sparks/pattern.js');
  const ctx = (style) => ({ dir, story, style, patternsBase: join(ROOT, 'patterns'), patterns: { 'emphasis/sparks': sparks }, schedule: { warnings: [] }, meta: { warnings: [] } });
  const off = await refRule(ctx({ color }));
  assert.equal(off.status, 'FAIL');
  assert.match(off.evidence.reason, /emphasis\/sparks is a particle emitter, which a brand allows with a particles block/);
  assert.equal((await refRule(ctx({ color, particles: { roles: ['accent'] } }))).status, 'PASS');
});

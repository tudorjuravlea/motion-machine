// Ground kinds (SPEC §3): bloom, graph-paper and dots beside the blobs. The arithmetic behind them is
// pure: the bloom's rise over a scene's first beat, the grid's yoyo drift and the scan band's sweep
// repeat exactly every cycle, and a ground with no block reads its defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOOM_FROM, GROUND_DEFAULTS, GROUND_KINDS, bloomScale, firstBeatWindow, gridOffset, groundSpec, heldTime, isAnimated, phaseOf, scanTop } from '../../runtime/kit/ground.js';
import { ease } from '../../runtime/kit/ease.js';

const style = { motion: { easings: { enter: 'cubic-bezier(0.16, 1, 0.3, 1)', exit: 'ease-in', move: 'ease-in-out' } } };
const enter = (p) => ease('enter', p, style);

test('the bloom rises from 0.9 to 1 with the enter ease over the window, and is 1 from the end of it', () => {
  assert.equal(BLOOM_FROM, 0.9);
  assert.equal(bloomScale(0, 1.3, enter), 0.9);
  assert.equal(bloomScale(1.3, 1.3, enter), 1);
  assert.equal(bloomScale(99, 1.3, enter), 1);
  assert.equal(bloomScale(-3, 1.3, enter), 0.9, 'before the scene it is at its start');
  const mid = bloomScale(0.65, 1.3, enter);
  assert.ok(mid > 0.9 && mid < 1);
  assert.ok(mid > 0.9 + 0.1 * 0.5, 'an expo-out ease is past halfway at half the time');
  assert.equal(bloomScale(0.5, 1.3, enter), bloomScale(0.5, 1.3, enter), 'pure');
  assert.equal(bloomScale(0.4, 0, enter), 1, 'no window: finished');
});

test('the window is the first beat\'s arrival, never less than the floor', () => {
  const beats = [{ start: 3.6, d: 0.8 }, { start: 3.1, d: 0.6 }, { start: 5, d: 1 }];
  assert.ok(Math.abs(firstBeatWindow(beats, 3, 0.4) - 0.7) < 1e-9, 'the earliest beat, 3.1 + 0.6, 3 s in');
  assert.equal(firstBeatWindow([{ start: 3, d: 0 }], 3, 0.4), 0.4, 'an instant beat: the floor');
  assert.equal(firstBeatWindow([], 3, 0.4), 0.4, 'no beat: the floor');
  assert.equal(firstBeatWindow([{ start: 3.2, d: 2 }], 3, 0.4), 2.2);
});

test('phase is exact for any t, negative included, and 0 at every whole cycle', () => {
  assert.equal(phaseOf(0, 8), 0);
  assert.equal(phaseOf(8, 8), 0);
  assert.equal(phaseOf(16, 8), 0);
  assert.equal(phaseOf(2, 8), 0.25);
  assert.equal(phaseOf(-2, 8), 0.75);
  for (const t of [0.3, 1.7, 4.4, 7.99]) assert.ok(Math.abs(phaseOf(t, 8) - phaseOf(t + 24, 8)) < 1e-12);
});

test('the grid drifts out and back: rest at the cycle\'s ends, the far point halfway, a loop by construction', () => {
  const o0 = gridOffset(0, 8, 0.01, 1920);
  assert.deepEqual(o0, { x: 0, y: 0 });
  const half = gridOffset(4, 8, 0.01, 1920);
  assert.ok(Math.abs(half.x - 19.2) < 1e-9 && Math.abs(half.y - 9.6) < 1e-9, JSON.stringify(half));
  for (const t of [0, 0.7, 2.5, 4, 5.9, 7.99]) {
    const a = gridOffset(t, 8, 0.01, 1920), b = gridOffset(t + 8, 8, 0.01, 1920), c = gridOffset(t + 80, 8, 0.01, 1920);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `t ${t}`);
    assert.ok(Math.abs(a.x - c.x) < 1e-9, `t ${t} ten cycles on`);
  }
});

test('the scan band enters above the frame and leaves below it once per cycle', () => {
  assert.equal(scanTop(0, 8, 0.18), -0.18);
  assert.ok(Math.abs(scanTop(8 - 1e-9, 8, 0.18) - 1) < 1e-6, 'its top reaches the frame\'s bottom edge as the cycle ends');
  assert.ok(scanTop(4, 8, 0.18) > 0 && scanTop(4, 8, 0.18) < 1);
  assert.equal(scanTop(3, 8, 0.2), scanTop(11, 8, 0.2));
});

test('a style that animates on twos or threes steps the ambient motion on its grid', () => {
  assert.equal(heldTime(1.234, 1), 1.234);
  assert.equal(heldTime(1.234, undefined), 1.234);
  assert.ok(Math.abs(heldTime(1.234, 3) - 1.2) < 1e-9, 'on threes: 1/10 s steps');
  assert.ok(Math.abs(heldTime(1.1, 3) - 1.1) < 1e-9);
  assert.ok(Math.abs(heldTime(1.234, 2) - 1.2) < 1e-9, 'on twos: 1/15 s steps');
});

test('a ground reads its kind\'s defaults for any block the brand left out; the old ground is blobs', () => {
  assert.deepEqual(GROUND_KINDS, ['blobs', 'bloom', 'graph-paper', 'dots']);
  const old = { blobs: [{ color: '#2a9d8f', x: 0, y: 0, w: 1, h: 1, alpha: 1 }], blur: 0.1 };
  assert.equal(groundSpec(old).kind, 'blobs');
  assert.equal(groundSpec(old).blobs.length, 1);
  assert.equal(isAnimated(groundSpec(old)), false);
  const bloom = groundSpec({ kind: 'bloom' });
  assert.deepEqual(bloom.bloom, GROUND_DEFAULTS.bloom);
  assert.equal(bloom.dots, undefined, 'the dot grid is optional on a bloom');
  assert.equal(isAnimated(bloom), true);
  assert.equal(groundSpec({ kind: 'bloom', bloom: { role: 'ink', strength: 0.2 }, dots: {} }).bloom.role, 'ink');
  assert.deepEqual(groundSpec({ kind: 'bloom', dots: { spacing: 0.04 } }).dots, { ...GROUND_DEFAULTS.dots, spacing: 0.04 });
  assert.deepEqual(groundSpec({ kind: 'dots' }).dots, GROUND_DEFAULTS.dots);
  assert.equal(isAnimated(groundSpec({ kind: 'dots' })), false);
  const gp = groundSpec({ kind: 'graph-paper', grid: { scan: {} } });
  assert.deepEqual(gp.grid.scan, GROUND_DEFAULTS.scan);
  assert.equal(groundSpec({ kind: 'graph-paper' }).grid.scan, undefined, 'the scan band is optional');
  assert.equal(groundSpec({ kind: 'graph-paper' }).grid.cycle, GROUND_DEFAULTS.grid.cycle);
});

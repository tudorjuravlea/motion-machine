// Scene cuts without a video: the colour difference of two frames, a cut as a spike over its neighbours
// (1.8x) with a minimum scene (0.5 s), and the snap of an edit's join onto a scene change that never
// moves an edge into a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourDifference, differences, hsvOf, sceneCuts, scenesOf, sceneTimes, snapRanges, snapSpan, SPIKE_RATIO, MIN_SCENE_S, SLIVER_S } from '../../scripts/lib/footage-scenes.mjs';

const flat = (r, g, b, n = 64) => Uint8Array.from({ length: n * 3 }, (_, i) => [r, g, b][i % 3]);
const diff = (a, b) => colourDifference(hsvOf(a), hsvOf(b));

test('the rules are named constants with the brief\'s values', () => {
  assert.equal(SPIKE_RATIO, 1.8);
  assert.equal(MIN_SCENE_S, 0.5);
});

test('colour difference: 0 for the same picture, large for unrelated ones, nothing for the hue of a grey', () => {
  assert.equal(diff(flat(200, 30, 30), flat(200, 30, 30)), 0);
  assert.ok(diff(flat(200, 30, 30), flat(30, 30, 200)) > 0.15, 'red against blue');
  assert.ok(diff(flat(20, 20, 20), flat(240, 240, 240)) > 0.25, 'black against white');
  assert.ok(diff(flat(100, 100, 100), flat(100, 100, 101)) < 0.01, 'a grey that tips toward blue is still the grey');
  assert.ok(diff(flat(200, 30, 30), flat(30, 30, 200)) <= 1);
});

/** `fps` frames a second of `seconds`, each a flat frame whose value comes from `f(i)`. */
const clip = (seconds, fps, f) => Array.from({ length: Math.round(seconds * fps) }, (_, i) => f(i));

test('a hard cut is a spike: found at the frame the new shot starts, with how far it stands over its neighbours', () => {
  const frames = [...clip(2, 30, () => flat(200, 30, 30)), ...clip(2, 30, () => flat(30, 30, 200))];
  const cuts = sceneCuts(differences(frames), 30);
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].at, 2);
  assert.equal(cuts[0].frame, 60);
  assert.ok(cuts[0].strength > 0.15);
  assert.equal(cuts[0].ratio, null, 'flat shots: the neighbours differ by nothing, so the ratio is unbounded');
});

test('a handheld shake is no cut: every frame differs, none stands 1.8x over the ones around it', () => {
  // a seeded jitter in value between frames, about 0.1 each, never a clear spike
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const frames = clip(4, 30, () => { const v = 100 + Math.round(rnd() * 60); return flat(v, v, v); });
  const diffs = differences(frames);
  assert.ok(Math.max(...diffs) > 0.05, 'the shake is real');
  assert.deepEqual(sceneCuts(diffs, 30), []);
  // and a real cut in the middle of the shake is still found
  const withCut = [...frames.slice(0, 60), ...clip(2, 30, () => { const v = 100 + Math.round(rnd() * 20); return flat(v, Math.min(255, v + 120), v); })];
  assert.equal(sceneCuts(differences(withCut), 30).length, 1);
});

test('the spike ratio is a parameter: a gentler step is a cut only when asked for', () => {
  const frames = [...clip(2, 30, () => flat(120, 120, 120)), ...clip(2, 30, () => flat(150, 150, 150))];
  const diffs = differences(frames);
  assert.equal(sceneCuts(diffs, 30, { minDiff: 0.02 }).length, 1);
  assert.equal(sceneCuts(diffs, 30).length, 0, 'under the floor of a cut, a step of 12 % in value is a change of light');
});

test('no scene is shorter than 0.5 s: of two cuts too close the stronger stays; none within 0.5 s of either end', () => {
  const frames = [...clip(1, 30, () => flat(200, 30, 30)), ...clip(0.3, 30, () => flat(30, 200, 30)), ...clip(1, 30, () => flat(30, 30, 200))];
  const cuts = sceneCuts(differences(frames), 30);
  assert.equal(cuts.length, 1, JSON.stringify(cuts));
  const early = [...clip(0.3, 30, () => flat(200, 30, 30)), ...clip(2, 30, () => flat(30, 30, 200))];
  assert.deepEqual(sceneCuts(differences(early), 30), [], 'a first scene of 0.3 s is not a scene');
  const late = [...clip(2, 30, () => flat(200, 30, 30)), ...clip(0.3, 30, () => flat(30, 30, 200))];
  assert.deepEqual(sceneCuts(differences(late), 30), []);
  const apart = [...clip(1, 30, () => flat(200, 30, 30)), ...clip(0.6, 30, () => flat(30, 200, 30)), ...clip(1, 30, () => flat(30, 30, 200))];
  assert.equal(sceneCuts(differences(apart), 30).length, 2, '0.6 s is a scene');
});

test('scenes between cuts, and the scene times of a scenes file on another clock', () => {
  assert.deepEqual(scenesOf([{ at: 2 }, { at: 5 }], 8), [{ start: 0, end: 2 }, { start: 2, end: 5 }, { start: 5, end: 8 }]);
  assert.deepEqual(scenesOf([], 3), [{ start: 0, end: 3 }]);
  assert.deepEqual(sceneTimes({ cuts: [{ at: 5 }, { at: 2 }] }, -0.5), [1.5, 4.5]);
  assert.throws(() => sceneTimes({ hello: 1 }), /scenes file/);
  assert.throws(() => sceneTimes({ cuts: [{ nope: 1 }] }), /scenes file/);
});

test('snap: an edge that would leave a sliver of the other shot moves onto the scene change', () => {
  // a cut 5.0-8.0; the kept side before it holds a scene change at 4.9 (0.1 s of the new shot would show); after it, one at 8.1
  const r = snapSpan({ start: 5.0, end: 8.0 }, [4.9, 8.1], []);
  assert.equal(r.start, 4.9);
  assert.equal(r.end, 8.1);
  assert.deepEqual(r.snapped, [{ edge: 'start', from: 5, to: 4.9 }, { edge: 'end', from: 8, to: 8.1 }]);
  assert.deepEqual(r.held, []);
  // a scene change further than a sliver away, or inside the cut, is not touched
  const far = snapSpan({ start: 5.0, end: 8.0 }, [4.5, 6.0, 8.5], []);
  assert.deepEqual([far.start, far.end, far.snapped.length], [5, 8, 0]);
  assert.ok(SLIVER_S > 0.1 && SLIVER_S < 0.5);
});

test('snap never moves an edge into a word: it holds, and says which word and where the scene change is', () => {
  const words = [{ text: 'amazing', start: 4.7, end: 5.0 }, { text: 'then', start: 8.0, end: 8.3 }];
  const r = snapSpan({ start: 5.0, end: 8.0 }, [4.9, 8.1], words);
  assert.deepEqual([r.start, r.end], [5, 8]);
  assert.deepEqual(r.held, [{ edge: 'start', scene: 4.9, word: 'amazing' }, { edge: 'end', scene: 8.1, word: 'then' }]);
  assert.deepEqual(r.snapped, []);
});

test('snap of kept ranges: each join, the first range\'s start and the last range\'s end stay; a stretch is never snapped away', () => {
  const ranges = [{ s: 0, e: 5 }, { s: 8, e: 12 }];
  const r = snapRanges(ranges, [4.9, 8.1], []);
  assert.deepEqual(r.ranges, [{ s: 0, e: 4.9 }, { s: 8.1, e: 12 }]);
  assert.deepEqual(r.snapped.map((x) => [x.edge, x.at]), [['start', 5], ['end', 5]]);
  assert.deepEqual(ranges, [{ s: 0, e: 5 }, { s: 8, e: 12 }], 'the input is not changed');
  const thin = snapRanges([{ s: 4.85, e: 5 }, { s: 8, e: 12 }], [4.9], []);
  assert.deepEqual(thin.ranges[0], { s: 4.85, e: 5 }, 'a kept stretch of 0.15 s would shrink under 0.1 s');
});

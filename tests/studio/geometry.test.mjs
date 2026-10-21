// Timeline geometry. Time ↔ x round trips, zoom fit and clamp, zoom anchored
// under the pointer, the snap priority table, span snapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule } from '../../runtime/kit/schedule.js';
import { timelineModel } from '../../scripts/studio/model.js';
import { fitZoom, clampZoom, timeToX, xToTime, zoomAt, snapTargets, snap, snapSpan, MAX_PX_PER_S } from '../../scripts/studio/geometry.js';

const editorial = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('fitZoom fits the whole duration between the pads', () => {
  assert.equal(fitZoom(10, 1032), 100);
  assert.equal(fitZoom(10, 1040, 20), 100);
  assert.equal(fitZoom(0, 1000), MAX_PX_PER_S, 'an empty timeline does not divide by zero');
});

test('clampZoom: from fit to 900 px/s (30 px a frame)', () => {
  assert.equal(MAX_PX_PER_S, 900);
  assert.equal(clampZoom(10, 10, 1032), 100);
  assert.equal(clampZoom(5000, 10, 1032), 900);
  assert.equal(clampZoom(250, 10, 1032), 250);
  assert.equal(clampZoom(10, 0.5, 1032), 900, 'a film shorter than the view at 900 px/s pins to 900');
});

test('timeToX and xToTime round trip, with scroll and pad', () => {
  for (const v of [{ pxPerS: 100 }, { pxPerS: 37.5, scrollS: 4.2 }, { pxPerS: 900, scrollS: 12, padPx: 0 }]) {
    for (const t of [0, 0.033, 1.5, 7.25, 48]) close(xToTime(timeToX(t, v), v), t, JSON.stringify(v));
    for (const x of [0, 16, 333, 1024]) close(timeToX(xToTime(x, v), v), x);
  }
  assert.equal(timeToX(0, { pxPerS: 100 }), 16);
  assert.equal(timeToX(3, { pxPerS: 100, scrollS: 1 }), 216);
});

test('zoomAt keeps the time under the anchor under it', () => {
  const box = { duration: 60, widthPx: 1032 };
  const v = { pxPerS: 50, scrollS: 10, padPx: 16 };
  for (const [factor, x] of [[2, 500], [1.25, 100], [0.8, 700], [3, 16]]) {
    const t = xToTime(x, v);
    const w = zoomAt(v, factor, x, box);
    close(w.pxPerS, v.pxPerS * factor);
    close(xToTime(x, w), t, `factor ${factor} at ${x}`);
    assert.equal(w.padPx, 16);
  }
});

test('zoomAt clamps the zoom and the scroll', () => {
  const box = { duration: 10, widthPx: 1032 };
  assert.equal(zoomAt({ pxPerS: 800, scrollS: 3 }, 4, 500, box).pxPerS, 900);
  const out = zoomAt({ pxPerS: 200, scrollS: 4 }, 0.01, 500, box);
  assert.deepEqual([out.pxPerS, out.scrollS], [100, 0], 'zooming out to fit scrolls back to 0');
  const right = zoomAt({ pxPerS: 200, scrollS: 4.9 }, 0.9, 16, box);
  close(right.scrollS, 10 - 1000 / 180, 'the scroll never passes the end');
});

// A two-scene film: a at 0..4 (headline at 0.5, sub at 1.2 out 3.5), b at 4..8 (headline at 0.3).
const story = {
  id: 't', kind: 'film', formats: ['16x9'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'a', layout: 'layouts/title-stack', cut: 'transitions/hard-cut', move: null, duration: 4,
      beats: [{ at: 0.5, slot: 'headline', fx: 'entrances/fade', text: 'h' }, { at: 1.2, slot: 'sub', fx: 'entrances/fade', text: 's', out: 3.5 }] },
    { id: 'b', layout: 'layouts/title-stack', cut: 'transitions/hard-cut', move: null, duration: 4,
      beats: [{ at: 0.3, slot: 'headline', fx: 'entrances/fade', text: 'h2' }] },
  ],
};
const grid = { bpm: 120, beats: [0, 0.5, 1, 1.5, 2], downbeats: [0, 2] };
const model = timelineModel(schedule(story, editorial), story, { format: '16x9', grid });

test('snapTargets: the priority table', () => {
  const targets = snapTargets(model, { playhead: 2.345 });
  const of = (kind) => targets.filter((x) => x.kind === kind);
  assert.deepEqual(of('playhead'), [{ t: 2.345, kind: 'playhead', priority: 0, source: 'playhead' }]);
  assert.deepEqual(of('beat').map((x) => [x.t, x.priority]), grid.beats.map((t) => [t, 1]));
  assert.deepEqual([...new Set(of('scene').map((x) => x.t))].sort((p, q) => p - q), [0, 4, 8]);
  assert.ok(of('scene').every((x) => x.priority === 2));
  const clipEdges = of('clip').map((x) => x.t);
  for (const t of [0.5, 1.2, 4.3]) assert.ok(clipEdges.includes(t), `clip start ${t}`);
  assert.ok(clipEdges.includes(Math.round((3.5 + 0.7 * 0.52) * 1000) / 1000), 'a clip ends where its exit ends');
  assert.ok(of('clip').every((x) => x.priority === 3));
  const frames = of('frame');
  assert.equal(frames.length, 8 * 30 + 1);
  assert.ok(frames.every((x) => x.priority === 4));
  close(frames[31].t, 31 / 30);
  assert.equal(snapTargets(model, {}).some((x) => x.kind === 'playhead'), false, 'no playhead, no playhead target');
  assert.equal(snapTargets(model, { fps: 10 }).filter((x) => x.kind === 'frame').length, 81);
});

test('snapTargets leaves out the dragged clip (and its cascade children)', () => {
  const sub = model.lanes.find((l) => l.id === 'slot:sub').clips[0];
  const without = snapTargets(model, { excludeClip: sub.id }).filter((x) => x.kind === 'clip').map((x) => x.t);
  assert.equal(without.includes(1.2), false);
  assert.equal(snapTargets(model, { excludeClip: sub }).filter((x) => x.kind === 'clip').some((x) => x.t === 1.2), false, 'a clip object works too');
  const kids = { ...model, lanes: [{ id: 'slot:x', kind: 'slot', clips: [{ id: 'p', start: 1, end: 2 }, { id: 'p.0', parent: 'p', start: 1.11, end: 2 }] }] };
  assert.deepEqual(snapTargets(kids, { excludeClip: 'p' }).filter((x) => x.kind === 'clip'), []);
});

test('snap: the lowest priority value within the radius wins, ties go to the nearest', () => {
  const T = [
    { t: 1.0, kind: 'frame', priority: 4 }, { t: 1.03, kind: 'clip', priority: 3 }, { t: 1.05, kind: 'beat', priority: 1 },
    { t: 1.06, kind: 'beat', priority: 1 }, { t: 2, kind: 'playhead', priority: 0 },
  ];
  assert.deepEqual(snap(1.0, T, { pxPerS: 100 }), { t: 1.05, target: T[2] }, 'a beat 5 px away beats a frame 0 px away');
  assert.deepEqual(snap(1.062, T, { pxPerS: 100 }), { t: 1.06, target: T[3] }, 'two beats: the nearer');
  assert.deepEqual(snap(1.0, T, { pxPerS: 1000 }), { t: 1.0, target: T[0] }, 'zoomed in, only the frame is within 8 px');
  assert.deepEqual(snap(1.95, T, { pxPerS: 100, radiusPx: 4 }), { t: 1.95, target: null }, 'nothing near');
  assert.deepEqual(snap(1.95, T, { pxPerS: 100 }), { t: 2, target: T[4] }, 'the playhead 5 px away');
  assert.deepEqual(snap(1.91, T, { pxPerS: 100 }), { t: 1.91, target: null }, '9 px is past the radius');
  assert.deepEqual(snap(1.5, [T[4]], { pxPerS: 16 }), { t: 2, target: T[4] }, 'exactly 8 px is within it');
});

test('snapSpan: a moved span snaps whichever edge is nearer a target', () => {
  const T = [{ t: 2, kind: 'scene', priority: 2 }, { t: 5.01, kind: 'scene', priority: 2 }];
  const s = snapSpan(1.97, 4.97, T, { pxPerS: 100 });
  close(s.delta, 0.03, 'the start is 3 px away, the end 4 px', 1e-12);
  assert.equal(s.target, T[0]);
  const d = snapSpan(1.95, 4.995, T, { pxPerS: 100 });
  close(d.delta, 0.015);
  assert.equal(d.target, T[1], 'the end is nearer');
  assert.deepEqual(snapSpan(3, 4, T, { pxPerS: 100 }), { delta: 0, target: null });
  const P = [{ t: 2, kind: 'frame', priority: 4 }, { t: 5.06, kind: 'playhead', priority: 0 }];
  close(snapSpan(2, 5, P, { pxPerS: 100 }).delta, 0.06, 'a lower priority value wins over a nearer frame, as in snap()');
});

// ---- a drag never snaps to its own echoes -------------------------------------------------

// a: 0..4 with a camera move; headline at 0.5 with a cue; sub (an ambient phone) at 1.23 with a tap at
// +0.4; b: 4..7, headline at 0.3. The cue starts with its beat; the ambient move and the camera move end
// with scene a.
const echo = {
  id: 'e', kind: 'film', formats: ['16x9'], title: 'e', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'a', layout: 'layouts/title-stack', cut: 'transitions/hard-cut', move: 'moves/push-in', duration: 4, beats: [
      { at: 0.5, slot: 'headline', fx: 'entrances/fade', text: 'h', cue: 'sound/tick' },
      { at: 1.23, slot: 'sub', fx: 'devices/phone3d', screen: [{ do: 'screen/tap', at: 0.4 }] }] },
    { id: 'b', layout: 'layouts/title-stack', cut: 'transitions/hard-cut', move: null, duration: 3, beats: [{ at: 0.3, slot: 'headline', fx: 'entrances/fade', text: 'x' }] },
  ],
};
const em = timelineModel(schedule(echo, editorial, { patterns: { 'devices/phone3d': { ambient: true } } }), echo, { format: '16x9' });
const clipOf = (path) => em.lanes.flatMap((l) => l.clips).find((c) => c.kind === 'beat' && c.path === path);

test('snapTargets: every target names its source', () => {
  const T = snapTargets({ ...em, grid: { beats: [0, 0.5] } }, { playhead: 2 });
  const src = (kind) => T.filter((x) => x.kind === kind).map((x) => x.source);
  assert.deepEqual(src('playhead'), ['playhead']);
  assert.deepEqual(src('beat'), ['beat:0', 'beat:1']);
  assert.deepEqual(src('scene'), ['scene:0:start', 'scene:0:end', 'scene:1:start', 'scene:1:end']);
  assert.ok(src('frame').every((s) => s === 'frame'));
  const ids = new Set(em.lanes.flatMap((l) => l.clips).map((c) => c.id));
  assert.ok(src('clip').every((s) => ids.has(s)), 'a clip edge names its clip id');
  assert.deepEqual(T.filter((x) => x.source === clipOf('/scenes/0/beats/0').id).map((x) => x.edge), ['start', 'end']);
});

test('exclude.clip drops the dragged beat, its cue and its moves, so a drag does not snap back to where it began', () => {
  const head = clipOf('/scenes/0/beats/0'), sub = clipOf('/scenes/0/beats/1');
  const cue = em.lanes.find((l) => l.id === 'cues').clips[0];
  assert.equal(cue.beat, head.path, 'the cue knows its beat');
  const T = snapTargets(em, { exclude: { clip: head.id } });
  assert.equal(T.some((x) => x.source === cue.id), false, 'its cue is gone');
  const r = snap(0.56, T, { pxPerS: 100 });
  assert.equal(r.target.kind, 'frame', `lands on a frame, not on its own cue (${r.target.source} at ${r.t})`);
  close(r.t, 17 / 30);
  // the phone's ambient move and its tap belong to it
  const mine = em.lanes.find((l) => l.id === 'moves').clips.filter((c) => c.beat === sub.path).map((c) => c.id);
  assert.deepEqual(em.lanes.find((l) => l.id === 'moves').clips.map((c) => [c.kind, c.beat]), [['move', null], ['move', sub.path], ['screen', sub.path]]);
  const T2 = snapTargets(em, { exclude: { clip: sub } });
  assert.equal(T2.some((x) => mine.includes(x.source) || x.source === sub.id), false);
  assert.ok(T2.some((x) => x.source === cue.id), 'another beat\'s cue stays');
  assert.deepEqual(snapTargets(em, { excludeClip: head.id }), T, 'excludeClip is an alias');
});

test('exclude.scene + sceneEnd: a scene-end drag drops its own end and everything that moves with it', () => {
  const T = snapTargets(em, { exclude: { scene: 0, sceneEnd: true } });
  const at4 = T.filter((x) => Math.abs(x.t - 4) < 1e-9).map((x) => `${x.kind}:${x.source}`);
  assert.deepEqual(at4, ['frame:frame'], `only the frame stays at 4 s: ${at4}`);
  assert.ok(T.some((x) => x.source === 'scene:0:start'), 'the scene\'s start stays');
  assert.ok(T.some((x) => x.source === clipOf('/scenes/0/beats/0').id && x.edge === 'start'), 'a clip start inside the scene stays');
  assert.equal(T.some((x) => x.source === clipOf('/scenes/1/beats/0').id), false, 'the next scene\'s clips move with the drag');
  const r = snap(4.06, T, { pxPerS: 100 });
  assert.equal(r.target.kind, 'frame');
  close(r.t, 122 / 30);
  // a beat with its own exit keeps its end: it does not end there because the scene ends
  const exiting = { ...echo, scenes: [{ ...echo.scenes[0], beats: [{ at: 0.5, slot: 'headline', fx: 'entrances/fade', text: 'h', out: 3 }] }, echo.scenes[1]] };
  const xm = timelineModel(schedule(exiting, editorial), exiting, { format: '16x9' });
  const h = xm.lanes[0].clips[0];
  assert.ok(snapTargets(xm, { exclude: { scene: 0, sceneEnd: true } }).some((x) => x.source === h.id && x.edge === 'end'));
  // exclude.scene alone drops both of its edges
  assert.deepEqual(snapTargets(em, { exclude: { scene: 1 } }).filter((x) => x.kind === 'scene').map((x) => x.source), ['scene:0:start', 'scene:0:end']);
});

// ---- NaN never passes the radius ------------------------------------------------------------

test('snap, snapTargets, zoomAt: NaN and a zero fps do not leak', () => {
  const m = { duration: 2, grid: { beats: [] }, scenes: [{ start: 0, end: 2 }], lanes: [{ clips: [{ id: 'a', start: 0.5, end: 1.5 }] }] };
  const T = snapTargets(m, { playhead: 1.9 });
  assert.deepEqual(snap(1.0, T, {}), { t: 1.0, target: null }, 'no pxPerS: nothing is near');
  assert.deepEqual(snap(1.0, T, { pxPerS: NaN }), { t: 1.0, target: null });
  assert.equal(snap(NaN, T, { pxPerS: 100 }).target, null);
  for (const fps of [0, -30, NaN]) assert.equal(snapTargets(m, { fps }).some((x) => x.kind === 'frame'), false, `fps ${fps}: no frame targets`);
  assert.equal(snapTargets({ ...m, duration: NaN }).some((x) => x.kind === 'frame'), false);
  const v = { pxPerS: 100, scrollS: 2, padPx: 16 };
  for (const f of [NaN, Infinity, undefined]) assert.deepEqual(zoomAt(v, f, 400, { duration: 30, widthPx: 800 }), v, `factor ${f}: the view is unchanged`);
});

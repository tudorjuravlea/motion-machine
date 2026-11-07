// Film distance: six axes read from story and style, per-axis same or different with the reason; the CLI exits 1 when fewer than four differ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AXES, filmDistance, filmProfile } from '../../scripts/lib/film-distance.mjs';
import { ROOT, mm } from './cli-helpers.mjs';

const piece = (id) => ({ story: JSON.parse(readFileSync(join(ROOT, 'pieces', id, 'story.json'), 'utf8')), style: JSON.parse(readFileSync(join(ROOT, 'pieces', id, 'style.json'), 'utf8')) });
const story = (scenes, audio = { track: null }) => ({ id: 't', kind: 'film', formats: ['16x9'], audio, scenes });
const style = { transitions: { opening: 'transitions/hard-cut' }, entrances: { headline: 'entrances/rise', body: 'entrances/fade' } };
const scene = (layout, duration, extra = {}) => ({ id: layout.split('/')[1] + duration, layout, duration, cut: 'transitions/hard-cut', move: null, beats: [{ at: 0, slot: 'headline', fx: 'style:headline', text: 'x', ...(extra.beat ?? {}) }], ...extra.scene });

test('six axes, and a piece against itself is six same', () => {
  const a = piece('golden-film-editorial');
  const d = filmDistance(a, a);
  assert.deepEqual(AXES, ['structure', 'opening', 'signature', 'camera', 'score', 'ending']);
  assert.equal(d.axes.length, 6);
  assert.equal(d.differing, 0);
  assert.ok(d.axes.every((x) => x.same && x.reason));
  assert.equal(d.close, true);
});

test('the two goldens of one story come out close: fewer than four axes differ', () => {
  const d = filmDistance(piece('golden-film-editorial'), piece('golden-film-kinetic'));
  assert.ok(d.differing < 4, JSON.stringify(d.axes.map((x) => [x.axis, x.same])));
  assert.equal(d.close, true);
});

test('a different film differs on enough axes to pass', () => {
  const a = { story: story([scene('layouts/statement', 4), scene('layouts/split', 6, { scene: { move: 'moves/push-in' } }), scene('layouts/endcard', 3, { beat: { cue: 'hit' } })]), style };
  const b = { story: story([scene('layouts/quote', 5, { beat: { fx: 'entrances/slam' } }), scene('layouts/stat-hero', 3), scene('layouts/bento-3', 8, { scene: { move: 'moves/orbit' } }), scene('layouts/list-reveal', 2, { beat: { cue: 'tick' } })], { track: 'assets/t.wav' }), style };
  const d = filmDistance(a, b);
  assert.ok(d.differing >= 4, JSON.stringify(d.axes));
  assert.equal(d.close, false);
});

test('each axis is read from the right place', () => {
  const p = filmProfile({ story: story([scene('layouts/statement', 2, { beat: { cue: 'hit', at: 0.1 } }), scene('layouts/split', 9, { scene: { move: 'moves/push-in', beats: [{ at: 0, slot: 'figure', fx: 'data/counter', value: 1, exit: 'exits/fade' }] } }), scene('layouts/endcard', 1)], { track: 'x.wav' }), style });
  assert.equal(p.structure.join(), 'layouts/statement,layouts/split,layouts/endcard');
  assert.deepEqual(p.opening, { layout: 'layouts/statement', entrance: 'entrances/rise' });
  assert.deepEqual(p.signature, { layout: 'layouts/split', pattern: 'data/counter' });
  assert.deepEqual(p.camera, ['moves/push-in']);
  assert.deepEqual(p.score, { cues: [1, 0, 0], track: true });
  assert.equal(p.ending.layout, 'layouts/endcard');
});

test('mm distance prints the axes and exits 1 when fewer than four differ, 0 otherwise', () => {
  const r = mm(['distance', 'golden-film-editorial', '--against', 'golden-film-kinetic']);
  assert.equal(r.status, 1, r.out);
  for (const a of AXES) assert.match(r.out, new RegExp(a));
  const self = mm(['distance', 'golden-film-editorial', '--against', 'golden-film-editorial']);
  assert.equal(self.status, 1);
  assert.match(self.out, /same/);
  assert.equal(mm(['distance', 'golden-film-editorial']).status, 2);
});

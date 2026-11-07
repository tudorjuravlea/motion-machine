// W-DEVICES (SPEC §7): a device budget. More than two scenes using one hero device kind (slam, crash-zoom, flash) in a film of
// 30 s or less warns. Warns only: a count, never a block.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { withStubs } from './_stubs.mjs';
import { DEVICE_MAX, FILM_MAX_S, KINDS, kindOf } from '../../scripts/check/W-DEVICES.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-DEVICES'] };
const check = async (dir) => row(await run(dir, only), 'W-DEVICES');
const IDS = ['entrances/slam', 'emphasis/stamp', 'moves/shake', 'transitions/impact', 'transitions/zoom-through', 'transitions/light-leak'];   // the first and third are named to show they are not counted
const stubbed = (edit) => variant('_base/film', (v) => { edit(v); withStubs(v.dir, Object.fromEntries(IDS.map((i) => [i, null]))); });
/** Scene `n` (0 based) stamps its headline. */
const slam = (...ns) => ({ story }) => ns.forEach((n) => { story.scenes[n].beats[0].emphasis = 'emphasis/stamp'; });

test('the budget is two scenes per kind in a film of 30 s or less', () => { assert.equal(DEVICE_MAX, 2); assert.equal(FILM_MAX_S, 30); });
test('every named pattern is one of three kinds, and kindOf finds it', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), ['crash-zoom', 'flash', 'slam']);
  assert.equal(kindOf('emphasis/stamp'), 'slam');
  assert.equal(kindOf('entrances/slam'), null, 'a style may give every headline the slam entrance: a default, not a hero device');
  assert.equal(kindOf('moves/shake'), null);
  assert.equal(kindOf('transitions/impact'), 'crash-zoom');
  assert.equal(kindOf('transitions/light-leak'), 'flash');
  assert.equal(kindOf('entrances/fade'), null);
});

test('three scenes that stamp warn, naming the kind and the scenes', async () => {
  const r = await check(stubbed(slam(0, 1, 2)));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.kind, 'slam');
  assert.equal(r.evidence.measured, 3);
  assert.equal(r.evidence.threshold, 2);
  assert.deepEqual(r.evidence.scenes, ['open', 'style', 'rests']);
});

test('two scenes pass, and the pass says how many uses it counted', async () => {
  const r = await check(stubbed(slam(0, 1)));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.uses, 2);
  assert.deepEqual(r.evidence.counts, { slam: 2 });
});

test('two stamps in one scene are one use; a slam entrance and a shake are not counted', async () => {
  const r = await check(stubbed((v) => { slam(0, 1)(v); scene(v.story, 'open').beats[1].emphasis = 'emphasis/stamp'; scene(v.story, 'rests').beats[0].fx = 'entrances/slam'; scene(v.story, 'rests').move = 'moves/shake'; }));
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.evidence.counts, { slam: 2 });
});

test('a cut and a move count towards their kind', async () => {
  const r = await check(stubbed(({ story }) => { for (const n of [1, 2, 3]) story.scenes[n].cut = 'transitions/zoom-through'; }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.kind, 'crash-zoom');
});

test('a film over 30 s is a SKIP with a reason', async () => {
  const r = await check(stubbed((v) => { slam(0, 1, 2)(v); v.story.scenes.forEach((sc) => { sc.duration = 7; }); }));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /35 s.*30 s or less/);
});

test('a film with none of these patterns is a SKIP: nothing was counted', async () => {
  const r = await check('_base/film');
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no slam, crash-zoom or flash/);
});

test('a style\'s gate.deviceMax sets the budget and the evidence says so', async () => {
  const r = await check(stubbed((v) => { slam(0, 1, 2)(v); v.style.gate = { deviceMax: 3 }; }));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.threshold, 3);
});

test('a deck is a SKIP', async () => assert.match((await check('_base/deck')).evidence.reason, /deck/));

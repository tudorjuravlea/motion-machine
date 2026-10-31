// W-POP and W-DEADSTOP (SPEC §7): read from the frames across each entrance, exit and move. A lone odd
// frame is a pop; one frame that carries a motion's whole change, followed by stillness, is a dead stop;
// a motion that ends at speed into another of the same element is a stitch. The thresholds' edges are
// tested on synthetic frames (strips.test.mjs); here the stubs in fixtures/negatives/_shared/patterns
// draw each behaviour and the library's ease does not trip any of them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup, beat } from './_variant.mjs';
import { MAX_FRAMES, readsHere } from '../../scripts/check/_strips.mjs';
import { join } from 'node:path';
import { NEG } from './_harness.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-POP', 'W-DEADSTOP'] };
/** The base film whose style headline (it starts at the scene's cut, 5 s) is changed by `edit`. */
const headline = (edit) => variant('_base/film', ({ story }) => edit(beat(story, 'style', 'headline')));

test('the base film, drawn with the library\'s rise and fade: no pop, no dead stop, and its frames are counted', async () => {
  const res = await run('_base/film', only);
  const pop = row(res, 'W-POP'), dead = row(res, 'W-DEADSTOP');
  assert.equal(pop.status, 'PASS');
  assert.equal(dead.status, 'PASS');
  assert.ok(pop.evidence.framesRead > 50 && pop.evidence.framesRead <= MAX_FRAMES, `${pop.evidence.framesRead} frames read`);
  assert.equal(pop.evidence.framesRead, dead.evidence.framesRead, 'both rules read the same frames, once');
});

test('fixtures/negatives/W-POP warns W-POP and nothing else, at the odd frame', async () => {
  const r = warnsOnly(await run('W-POP'), 'W-POP');
  assert.equal(r.evidence.instant, 5.233, 'the eighth frame of the entrance that starts at 5 s');
  assert.match(r.evidence.selector, /style.*headline/);
  assert.match(r.evidence.reason, /differs from the frames either side of it, which match each other/);
});

test('a jolt too small to see is not a pop', async () => {
  const r = row(await run(headline((b) => { b.fx = 'entrances/flash'; b.at = 0; b.params = { jolt: 1 }; }), only), 'W-POP');
  assert.equal(r.status, 'PASS');
  const big = row(await run(headline((b) => { b.fx = 'entrances/flash'; b.at = 0; b.params = { jolt: 30 }; }), only), 'W-POP');
  assert.equal(big.status, 'WARN');
});

test('fixtures/negatives/W-DEADSTOP warns W-DEADSTOP and nothing else', async () => {
  const r = warnsOnly(await run('W-DEADSTOP'), 'W-DEADSTOP');
  assert.equal(r.evidence.measured, 1, 'the whole change in one frame');
  assert.equal(r.evidence.instant, 5);
  assert.match(r.evidence.reason, /stands still for 15 frames/);
});

test('a stitch: a constant-speed entrance that stops as a constant-speed shift starts', async () => {
  const stitched = await run(headline((b) => { b.fx = 'entrances/slide-in'; b.at = 0; b.params = { linear: true, side: 'up' }; b.emphasis = 'emphasis/shift-linear'; }), only);
  const r = row(stitched, 'W-DEADSTOP');
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.stitches.map((x) => [x.from, x.to, x.gap]), [['arrive', 'move', 0]]);
  assert.match(r.evidence.reason, /its arrive stops and its move starts 0 frames later, both at speed; make it one gesture/);
  assert.equal(row(stitched, 'W-POP').status, 'PASS');
});

test('the same two motions eased into each other are one gesture, not a stitch', async () => {
  const r = row(await run(headline((b) => { b.fx = 'entrances/slide-in'; b.at = 0; b.params = { side: 'up' }; b.emphasis = 'emphasis/shift-eased'; }), only), 'W-DEADSTOP');
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.evidence.stitches ?? [], []);
});

test('a constant-speed entrance on its own is not a dead stop either', async () => {
  const r = row(await run(headline((b) => { b.fx = 'entrances/slide-in'; b.at = 0; b.params = { linear: true, side: 'up' }; }), only), 'W-DEADSTOP');
  assert.equal(r.status, 'PASS');
});

test('a deck plays on presses: both rules are SKIP with a reason', async () => {
  const res = await run('_base/deck', only);
  for (const id of ['W-POP', 'W-DEADSTOP']) {
    const r = row(res, id);
    assert.equal(r.status, 'SKIP');
    assert.match(r.evidence.reason, /deck/);
  }
});

test('the frames are read in the first format only, unless the story has scenes of its own per format', () => {
  const ctx = (dir, format) => ({ dir, format, formats: ['9x16', '1x1', '16x9'], cache: {} });
  const plain = join(NEG, '_base/film'), variants = join(NEG, '_base/variants');
  assert.equal(readsHere(ctx(plain, '9x16')), true);
  assert.equal(readsHere(ctx(plain, '1x1')), false);
  assert.equal(readsHere(ctx(variants, '1x1')), true, 'variants: each format draws its own beats');
  assert.equal(readsHere(ctx(join(NEG, 'nowhere'), '1x1')), true, 'a story that cannot be read is read everywhere');
});

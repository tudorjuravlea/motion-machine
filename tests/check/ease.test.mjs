// W-EASE through the whole gate: a style or a beat that spells an ease the kit would not draw as written warns with
// exactly its id (the base film with its ease edited), and a film that wears eases from the families passes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup, beat } from './_variant.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-EASE'] };

test('the base film wears eases from the families and passes; the pieces render with them', async () => {
  const dir = variant('_base/film', ({ style }) => { style.motion.easings.enter = 'back.out(1.4)'; style.motion.easings.move = 'expo.inOut'; style.motion.stagger.ease = 'quad.out'; });
  const r = row(await run(dir, only), 'W-EASE');
  assert.equal(r.status, 'PASS', r.evidence.reason);
  assert.equal(r.evidence.measured, 4);
});

test('a style ease that is a partial steps() warns, and only W-EASE does', async () => {
  const dir = variant('_base/film', ({ style }) => { style.motion.easings.move = 'steps(2.5)'; });
  const r = warnsOnly(await run(dir), 'W-EASE');
  assert.equal(r.evidence.selector, 'style.motion.easings.move');
  assert.match(r.evidence.reason, /steps\(2\.5\)/);
});

test('a cascade ease the kit does not know warns where the beat spells it', async () => {
  const dir = variant('_base/film', ({ story }) => {
    const b = beat(story, story.scenes[0].id, story.scenes[0].beats[0].slot);
    b.text = 'one | two | three';
    b.params = { ...(b.params ?? {}), each: true, stagger: { each: 0.08, ease: 'bak.out' } };
  });
  const r = row(await run(dir, only), 'W-EASE');
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.selector, /params\.stagger\.ease$/);
});

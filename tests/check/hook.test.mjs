// W-HOOK: a film's frame 0 and a deck's rest 0 show the first scene's headline finished.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { headlineOf } from '../../scripts/check/W-HOOK.mjs';

const run = gate();

test('the bases pass: an instant headline at 0 s (film) and a step 0 headline (deck), with ink on screen', async () => {
  for (const kind of ['film', 'deck']) {
    const r = row(await run(`_base/${kind}`, { only: ['W-HOOK'] }), 'W-HOOK');
    assert.equal(r.status, 'PASS', r.evidence.reason);
    assert.ok(parseFloat(r.evidence.measured) > 10);
  }
});

test('W-HOOK/film: a headline that enters at frame 0 is not yet there', async () => {
  const r = warnsOnly(await run('W-HOOK/film'), 'W-HOOK');
  assert.equal(r.evidence.selector, '[data-scene="open"] [data-slot="headline"]');
  assert.match(r.evidence.reason, /params\.instant/);
});

test('W-HOOK/deck: rest 0 is a blank slide', async () => {
  const r = warnsOnly(await run('W-HOOK/deck'), 'W-HOOK');
  assert.match(r.evidence.reason, /step: 0/);
});

test('the headline is the first scene\'s headline slot, else its earliest beat', () => {
  const items = [{ scene: 'a', slot: 'sub', start: 0.1 }, { scene: 'a', slot: 'kicker', start: 0 }, { scene: 'b', slot: 'headline', start: 5 }];
  assert.equal(headlineOf({ kind: 'film', scenes: [{ id: 'a' }, { id: 'b' }], items }).slot, 'kicker');
  assert.equal(headlineOf({ kind: 'film', scenes: [{ id: 'a' }], items: [...items, { scene: 'a', slot: 'headline', start: 1 }] }).slot, 'headline');
});

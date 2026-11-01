// W-DECK-STEP (SPEC §7): a deck beat is stepped but no press reaches it (a step past the scene's presses, an exit
// at or before the arrival, an exit past the scene, a screen action past the scene), or two beats of one scene
// drive the same slot (one id, one element: the later beat overwrites the earlier). Provisional; a warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { findings } from '../../scripts/check/W-DECK-STEP.mjs';
import { gate, row, warnsOnly } from './_harness.mjs';

const run = gate();
const scene = (extra = {}) => ({ id: 's1', presses: 2, beats: [{ at: 0, step: 1, slot: 'headline', fx: 'entrances/rise', text: 'a' }, { at: 0, step: 2, slot: 'sub', fx: 'entrances/fade', text: 'b' }], ...extra });
const deck = (...scenes) => ({ kind: 'deck', scenes });

test('a clean deck has no finding; step 0 and a step on the last press are reached', () => {
  assert.deepEqual(findings(deck(scene())), []);
  assert.deepEqual(findings(deck(scene({ beats: [{ at: 0, step: 0, slot: 'headline' }, { at: 0, slot: 'sub' }] }))), [], 'step 0, and the default step 1');
});

test('a step past the scene\'s presses is a finding that names the scene, the slot and the step', () => {
  const f = findings(deck(scene({ beats: [{ at: 0, step: 1, slot: 'headline' }, { at: 0, step: 3, slot: 'sub' }] })));
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].kind, f[0].scene, f[0].slot, f[0].step], ['step', 's1', 'sub', 3]);
  assert.match(f[0].reason, /s1/);
  assert.match(f[0].reason, /sub/);
  assert.match(f[0].reason, /press/);
});

test('an exit at or before the arrival, or past the scene, is a finding; an exit on a later press is not', () => {
  const at = (b) => findings(deck(scene({ presses: 3, beats: [{ at: 0, slot: 'headline', ...b }] }))).map((x) => x.kind);
  assert.deepEqual(at({ step: 2, until: 2 }), ['exit']);
  assert.deepEqual(at({ step: 2, until: 3 }), []);
  assert.deepEqual(at({ step: 1, until: 5 }), ['exit']);
  assert.deepEqual(at({ step: 1, until: 3 }), []);
});

test('a screen action whose step lands past the scene is a finding', () => {
  const f = findings(deck(scene({ beats: [{ at: 0, step: 1, slot: 'headline', screen: [{ do: 'screen/tap', step: 0 }, { do: 'screen/swap', step: 2 }] }] })));
  assert.deepEqual(f.map((x) => [x.kind, x.slot]), [['screen', 'headline']]);
});

test('two beats on one slot of one scene share an id; the same slot in two scenes does not', () => {
  const dup = findings(deck(scene({ beats: [{ at: 0, step: 1, slot: 'headline' }, { at: 0, step: 2, slot: 'headline' }] })));
  assert.deepEqual(dup.map((x) => [x.kind, x.scene, x.slot]), [['id', 's1', 'headline']]);
  assert.deepEqual(findings(deck(scene(), scene({ id: 's2' }))), []);
});

test('a film has nothing to judge', () => {
  assert.deepEqual(findings({ kind: 'film', scenes: [scene()] }), []);
});

test('a deck with a step no press reaches warns W-DECK-STEP and nothing else', async () => {
  const r = warnsOnly(await run('W-DECK-STEP/unreached'), 'W-DECK-STEP');
  assert.equal(r.evidence.problems.length, 1);
  assert.equal(r.evidence.problems[0].kind, 'step');
  assert.match(r.evidence.reason, /middle/);
});

test('a deck with two beats on one slot warns W-DECK-STEP and nothing else', async () => {
  const r = warnsOnly(await run('W-DECK-STEP/shared'), 'W-DECK-STEP');
  assert.equal(r.evidence.problems[0].kind, 'id');
});

test('the base deck and the shipped decks pass; a film is SKIP with a reason', async () => {
  const only = { only: ['W-DECK-STEP'] };
  assert.equal(row(await run('_base/deck', only), 'W-DECK-STEP').status, 'PASS');
  for (const piece of ['golden-deck-editorial', 'golden-deck-kinetic', 'demo-deck']) assert.equal(row(await run(join(ROOT, 'pieces', piece), only), 'W-DECK-STEP').status, 'PASS', piece);
  const film = row(await run('_base/film', only), 'W-DECK-STEP');
  assert.equal(film.status, 'SKIP');
  assert.match(film.evidence.reason, /film/);
});

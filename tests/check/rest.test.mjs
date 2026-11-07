// G-REST and W-SCENE-END (SPEC §7). G-REST: a deck rest, and a film's settle rest, are finished pictures;
// a deck press drawn mid-entrance breaks the deck, so it fails. W-SCENE-END: a film scene that ends while
// an element is still moving (a match cut, a whip) is a technique, so it warns and never fails.
// W-HOLD is the same defect seen by another warning: a scene still arriving at its end has a rest of 0 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, warnsOnly, row } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/W-SCENE-END: a film carrying motion into a cut warns W-SCENE-END, names the selector and the progress, and passes G-REST', async () => {
  const res = await run('W-SCENE-END');
  const r = warnsOnly(res, 'W-SCENE-END', { inherent: ['W-HOLD'] });
  assert.match(r.evidence.reason, /mid-entrance/);
  assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="sub"]');
  assert.ok(r.evidence.measured > 0 && r.evidence.measured < 1);
  assert.equal(row(res, 'G-REST').status, 'PASS', 'the film half never fails');
  assert.equal(res.code, 0);
});

test('fixtures/negatives/G-REST/deck: a deck rest drawn mid-entrance fails G-REST, and W-SCENE-END has nothing to say about a deck', async () => {
  const res = await run('G-REST/deck');
  const r = failsOnly(res, 'G-REST', { inherent: ['W-OVERSHOOT', 'W-CONTRAST'] });   // the half-drawn press also reads as a dip, and its text is still fading in
  assert.match(r.evidence.reason, /mid-entrance at rest 2/);
  assert.equal(r.evidence.instant, 2);
  assert.ok(r.evidence.measured > 0 && r.evidence.measured < 1);
  const w = row(res, 'W-SCENE-END');
  assert.equal(w.status, 'SKIP');
  assert.match(w.evidence.reason, /deck/);
});

test('the bases pass both halves: every rest of the film and the deck is finished', async () => {
  for (const kind of ['film', 'deck']) {
    const res = await run(`_base/${kind}`, { only: ['G-REST', 'W-SCENE-END'] });
    assert.equal(row(res, 'G-REST').status, 'PASS', kind);
    assert.equal(row(res, 'W-SCENE-END').status, kind === 'film' ? 'PASS' : 'SKIP', kind);
  }
});

// W-LOOP (SPEC §7): a story declares its open loops (`loops: [{ id, opens, closes, question }]`). More
// than one main and one secondary open at once, a loop that never closes, and a loop that closes after
// the scene showing the call to action each warn. Read from the story, so it runs here on a built ctx;
// one case runs the gate on fixtures/negatives/W-LOOP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import wLoop, { MAX_OPEN, ctaScene } from '../../scripts/check/W-LOOP.mjs';
import { gate, warnsOnly, row } from './_harness.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

const run = gate();

const SCENES = ['a', 'b', 'c', 'd', 'e', 'f'];
const story = (loops, { cta = 'f', outro } = {}) => ({
  cta: { text: 'Join now', url: 'example.com' },
  scenes: SCENES.map((id) => ({ id, ...(id === outro ? { position: 'outro' } : {}), beats: [{ text: id === cta ? 'Join now' : id }] })),
  ...(loops ? { loops } : {}),
});
const loop = (id, opens, closes) => ({ id, opens, closes, question: `${id}?` });
const check = (loops, opts) => wLoop({ story: story(loops, opts) });

test('no loops declared: SKIP with a reason', async () => {
  const r = await check(undefined);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no open loops/);
  assert.equal((await check([])).status, 'SKIP');
});

test('one main and one secondary loop open at once pass; a third warns', async () => {
  assert.equal(MAX_OPEN, 2);
  const two = await check([loop('main', 'a', 'e'), loop('side', 'b', 'd')]);
  assert.equal(two.status, 'PASS');
  assert.equal(two.evidence.measured, 2);
  const three = await check([loop('main', 'a', 'e'), loop('side', 'b', 'd'), loop('extra', 'c', 'e')]);
  assert.equal(three.status, 'WARN');
  assert.equal(three.evidence.measured, 3);
  assert.deepEqual(three.evidence.problems.map((p) => p.problem), ['too-many-open']);
  assert.match(three.evidence.reason, /3 loops are open at once in "c" \(main, side, extra\)/);
});

test('a loop is open from the scene that opens it up to, not including, the scene that closes it', async () => {
  const relay = await check([loop('one', 'a', 'c'), loop('two', 'b', 'd'), loop('three', 'c', 'e')]);
  assert.equal(relay.status, 'PASS', 'three loops in a relay: one closes in the scene the next opens, so at most two are open');
  assert.equal(relay.evidence.measured, 2);
  const tight = await check([loop('one', 'a', 'd'), loop('two', 'b', 'd'), loop('three', 'c', 'e')]);
  assert.equal(tight.status, 'WARN', 'all three are open in c');
});

test('a loop that never closes warns: no closes, null, a scene the story lacks, or a scene before it opens', async () => {
  for (const l of [{ id: 'x', opens: 'b', question: 'x?' }, { id: 'x', opens: 'b', closes: null, question: 'x?' }, loop('x', 'b', 'zz'), loop('x', 'c', 'a')]) {
    const r = await check([l]);
    assert.equal(r.status, 'WARN', JSON.stringify(l));
    assert.equal(r.evidence.problems[0].problem, 'never-closes');
    assert.match(r.evidence.reason, /never close/);
  }
  const open = await check([{ id: 'x', opens: 'c', question: 'x?' }]);
  assert.equal(open.evidence.measured, 1);
});

test('a loop that never closes stays open to the end and counts against the limit', async () => {
  const r = await check([loop('a1', 'a', 'f'), { id: 'a2', opens: 'a', question: 'q?' }, { id: 'a3', opens: 'b', question: 'q?' }]);
  assert.deepEqual(r.evidence.problems.map((p) => p.problem).sort(), ['never-closes', 'never-closes', 'too-many-open']);
});

test('a loop that opens in a scene the story lacks warns', async () => {
  const r = await check([loop('x', 'nope', 'c')]);
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.problems[0].problem, 'opens-unknown');
});

test('closing after the call to action warns; closing in the call-to-action scene does not', async () => {
  const after = await check([loop('x', 'a', 'f')], { cta: 'd' });
  assert.equal(after.status, 'WARN');
  assert.equal(after.evidence.problems[0].problem, 'after-cta');
  assert.match(after.evidence.reason, /after the call to action in "d"/);
  assert.equal((await check([loop('x', 'a', 'd')], { cta: 'd' })).status, 'PASS');
  assert.equal((await check([loop('x', 'a', 'c')], { cta: 'd' })).status, 'PASS');
});

test('the call-to-action scene is the one that shows its text, else the last outro, else the last scene', () => {
  assert.equal(ctaScene(story([], { cta: 'c' })), 2);
  const none = story([], { cta: null, outro: 'e' });
  assert.equal(ctaScene(none), 4, 'no scene shows it: the outro');
  assert.equal(ctaScene(story([], { cta: null })), 5, 'no outro either: the last scene');
  const twice = story([], { cta: 'c' });
  twice.scenes[4].beats[0].text = 'Join now!';
  assert.equal(ctaScene(twice), 4, 'shown in two scenes: the later');
});

test('the contract takes loops with an optional closes and refuses what it does not know', () => {
  const { story: valid } = validators();
  const ok = (l) => valid({ ...minimal(), loops: l });
  assert.equal(ok([{ id: 'x', opens: 'a', question: 'q?' }]), true, 'closes is optional');
  assert.equal(ok([{ id: 'x', opens: 'a', closes: null, question: 'q?' }]), true);
  assert.equal(ok([{ id: 'x', opens: 'a', closes: 'b', question: 'q?', extra: 1 }]), false);
  assert.equal(ok([{ id: 'x', closes: 'b', question: 'q?' }]), false, 'opens is required');
  assert.equal(ok([{ id: 'X', opens: 'a', question: 'q?' }]), false);
});

const minimal = () => ({
  id: 'minimal', kind: 'film', formats: ['16x9'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/title-stack', duration: 5, cut: 'transitions/hard-cut', move: null, beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'x' }], say: 'x' }],
  cta: { text: 'x', url: 'x' },
});

test('fixtures/negatives/W-LOOP warns W-LOOP and nothing else', async () => {
  const r = warnsOnly(await run('W-LOOP'), 'W-LOOP');
  assert.deepEqual(r.evidence.problems.map((p) => p.problem), ['too-many-open']);
});

test('a film with no loops: SKIP with a reason', async () => {
  const r = row(await run('_base/film', { only: ['W-LOOP'] }), 'W-LOOP');
  assert.equal(r.status, 'SKIP');
});

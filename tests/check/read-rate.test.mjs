// W-READ's reading-rate ceiling (SPEC §7): a line's characters over its entrance and its settled hold may not pass 17 a second.
// The word rules are unchanged; a line that fails them still reports them first.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { CHARS_PER_S, charsOf } from '../../scripts/check/W-READ.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-READ'] };
const check = async (dir) => row(await run(dir, only), 'W-READ');
/** One scene of `d` seconds holding one 5-word, 50-character line that arrives at once. */
const one = (d, text) => ({ story }) => {
  story.scenes.length = 1;
  const sc = scene(story, 'open');
  sc.duration = d;
  sc.beats = [{ at: 0, slot: 'headline', fx: 'entrances/fade', text, params: { instant: true } }];
};
const LINE = 'Internationalization defaults prevent surprises ok';   // 5 words, 50 characters

test('the ceiling is 17 characters a second', () => assert.equal(CHARS_PER_S, 17));
test('charsOf counts characters with single spaces, not bytes', () => {
  assert.equal(charsOf('  a  b '), 3);
  assert.equal(charsOf('Café ☕'), 6);
  assert.equal(charsOf(''), 0);
});

test('50 characters over 2.4 s is 20.8 a second: the word rules pass, the rate warns', async () => {
  assert.equal(LINE.length, 50);
  const r = await check(variant('_base/film', one(2.4, LINE)));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.kind, 'rate');
  assert.equal(r.evidence.measured, 20.8);
  assert.equal(r.evidence.threshold, 17);
  assert.match(r.evidence.reason, /50 characters.*2.4 s.*20.8 a second.*17/);
});

test('the same line over 4 s passes, and the pass says how many lines it read', async () => {
  const r = await check(variant('_base/film', one(4, LINE)));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.lines, 1);
  assert.equal(r.evidence.maxCharsPerS, 12.5);
});

test('a line that breaks the word rules reports those, not the rate', async () => {
  const r = await check(variant('_base/film', one(1, LINE)));
  assert.equal(r.status, 'WARN');
  assert.notEqual(r.evidence.kind, 'rate');
});

test('a style\'s gate.read.charsPerS sets the ceiling and the evidence says so', async () => {
  const r = await check(variant('_base/film', (v) => { one(2.4, LINE)(v); v.style.gate = { read: { charsPerS: 25 } }; }));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.charsPerS, 25);
});

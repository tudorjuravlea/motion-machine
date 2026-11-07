// W-NUMBER (SPEC §7): a number a beat shows must equal the number of the fact it cites, to the precision the fact states. Read from
// the beat: its `value` at the decimals `fix` asks for (the patterns rest on exactly that), and the numbers in its text.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { withStubs } from './_stubs.mjs';
import { numbersIn, shownNumbers, agrees } from '../../scripts/check/W-NUMBER.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-NUMBER'] };
const check = async (dir) => row(await run(dir, only), 'W-NUMBER');
/** The first scene's headline cites f1 (text `fact`) and shows `beat`. */
const cite = (fact, beat) => variant('_base/film', (v) => {
  v.story.facts = [{ id: 'f1', text: fact, source: 'test' }];
  const b = scene(v.story, 'open').beats[0];
  delete b.text;
  Object.assign(b, { fact: 'f1', ...beat });
  withStubs(v.dir, { 'data/unit-stack': null });
});

test('numbersIn reads plain numbers and ignores hex colours, ids and number-letter tokens', () => {
  assert.deepEqual(numbersIn('Saves 7.3 t, 1\u202f234 plates and 4.26:1 at #D2491F in 9x16'), [{ text: '7.3', value: 7.3, decimals: 1 }, { text: '1\u202f234', value: 1234, decimals: 0 }, { text: '4.26', value: 4.26, decimals: 2 }, { text: '1', value: 1, decimals: 0 }]);
  assert.deepEqual(numbersIn('7.3t and 30fps and 7 cuts').map((n) => n.value), [7], 'a number glued to letters is not a number');
  assert.deepEqual(numbersIn('1,234.5 and 12,5'), [{ text: '1,234.5', value: 1234.5, decimals: 1 }, { text: '12,5', value: 12.5, decimals: 1 }]);
  assert.deepEqual(numbersIn('no digits'), []);
});
test('agrees compares at the fact\'s decimals: 7 is not 7.3, 94.2 is 94, 94 is not 94.2', () => {
  assert.equal(agrees(7, { value: 7.3, decimals: 1 }), false);
  assert.equal(agrees(7.3, { value: 7.3, decimals: 1 }), true);
  assert.equal(agrees(94.2, { value: 94, decimals: 0 }), true);
  assert.equal(agrees(94, { value: 94.2, decimals: 1 }), false);
  assert.equal(agrees(-8, { value: 8, decimals: 0 }), true, 'the sign is the pattern\'s to draw');
});
test('shownNumbers takes a value at the decimals fix asks for, and the numbers in the text', () => {
  assert.deepEqual(shownNumbers({ value: 7.3, params: { fix: 0 } }).map((n) => n.value), [7]);
  assert.deepEqual(shownNumbers({ value: 7.3, params: {} }).map((n) => n.value), [7.3]);
  assert.deepEqual(shownNumbers({ text: 'Saves 7 tonnes in 3 sites' }).map((n) => n.value), [7, 3]);
});

test('a unit stack that rests on 7 for a cited 7.3 warns, naming both numbers', async () => {
  const r = await check(cite('Savings reached 7.3 tonnes a year.', { fx: 'data/unit-stack', value: 7.3, params: { fix: 0 } }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 7);
  assert.equal(r.evidence.threshold, 7.3);
  assert.equal(r.evidence.fact, 'f1');
  assert.equal(r.evidence.read, 'static');
  assert.match(r.evidence.reason, /shows 7.*fact f1 says 7.3/);
});

test('the same stack at the value\'s own decimals passes, and the pass says how many numbers it compared', async () => {
  const r = await check(cite('Savings reached 7.3 tonnes a year.', { fx: 'data/unit-stack', value: 7.3, params: {} }));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.compared, 1);
});

test('a number in the text is read too', async () => {
  const bad = await check(cite('Savings reached 7.3 tonnes a year.', { fx: 'entrances/fade', text: 'Saves 7 tonnes a year' }));
  assert.equal(bad.status, 'WARN');
  assert.equal(bad.evidence.measured, 7);
  assert.equal((await check(cite('Savings reached 7.3 tonnes a year.', { fx: 'entrances/fade', text: 'Saves 7.3 tonnes a year' }))).status, 'PASS');
});

test('a shown value more precise than the fact agrees when it rounds to it', async () => {
  assert.equal((await check(cite('94 percent of orders shipped.', { fx: 'data/unit-stack', value: 94.2, params: { fix: 1 } }))).status, 'PASS');
  assert.equal((await check(cite('94.2 percent of orders shipped.', { fx: 'data/unit-stack', value: 94, params: {} }))).status, 'WARN');
});

test('a beat that cites a fact but shows no number reads nothing: SKIP with a reason', async () => {
  const r = await check(cite('Savings reached 7.3 tonnes a year.', { fx: 'entrances/fade', text: 'Savings, in tonnes' }));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no beat that cites a fact shows a number/);
});

test('a fact with no number cannot disagree: SKIP', async () => {
  const r = await check(cite('Savings were large.', { fx: 'entrances/fade', text: 'Saves 7 tonnes' }));
  assert.equal(r.status, 'SKIP');
});

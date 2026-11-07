// W-TOKENS (SPEC §7): across a piece's rests, more than 4 distinct stroke widths, 5 font sizes or 3
// corner radii warn (a style's gate.tokens sets its own). Each case here is the base film with CSS that
// gives the sub line, in n of its five scenes, n different values; the edge is the limit and the
// value one past it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup } from './_variant.mjs';
import { STROKES, SIZES, RADII } from '../../scripts/check/W-TOKENS.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-TOKENS'] };
const SCENES = ['open', 'style', 'rests', 'sizes', 'close'];
const sub = (i, decl) => `[data-scene="${SCENES[i]}"] [data-slot="sub"] { ${decl} }\n`;
const head = (i, decl) => `[data-scene="${SCENES[i]}"] [data-slot="headline"] { ${decl} }\n`;
const gateOf = async (css, style) => row(await run(variant('_base/film', style ? ({ style: s }) => { s.gate = style; } : undefined, { css }), only), 'W-TOKENS');

test('the limits are 4 stroke widths, 5 font sizes and 3 corner radii', () => {
  assert.deepEqual([STROKES, SIZES, RADII], [4, 5, 3]);
});

test('the base film uses two font sizes and no strokes or radii: PASS, with the values read', async () => {
  const r = row(await run('_base/film', only), 'W-TOKENS');
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.evidence.counts, { strokes: 0, sizes: 2, radii: 0 });
  assert.equal(r.evidence.values.sizes.length, 2);
});

test('stroke widths: four distinct pass, a fifth warns', async () => {
  const border = (n) => Array.from({ length: n }, (_, i) => sub(i, `border: ${i + 1}px solid var(--mm-color-canvas);`)).join('');
  const four = await gateOf(border(4));
  assert.equal(four.status, 'PASS');
  assert.deepEqual(four.evidence.values.strokes, [1, 2, 3, 4]);
  const five = await gateOf(border(5));
  assert.equal(five.status, 'WARN');
  assert.equal(five.evidence.measured, 5);
  assert.match(five.evidence.reason, /5 distinct stroke widths \(1, 2, 3, 4, 5\) against 4/);
});

test('stroke widths: the same width on many elements is one value, and a transparent border draws nothing', async () => {
  const same = await gateOf(SCENES.map((_, i) => sub(i, 'border: 2px solid var(--mm-color-canvas);')).join(''));
  assert.deepEqual(same.evidence.values.strokes, [2]);
  const clear = await gateOf(SCENES.map((_, i) => sub(i, `border: ${i + 1}px solid transparent;`)).join(''));
  assert.deepEqual(clear.evidence.values.strokes, []);
  assert.equal(clear.status, 'PASS');
});

test('font sizes: five distinct pass, a sixth warns', async () => {
  // the base uses the layout's headline size and the sub's; n scenes get a headline size of their own
  const sized = (n) => Array.from({ length: n }, (_, i) => head(i, `font-size: calc(var(--mm-size-display) * var(--mm-headline-scale) * ${(0.7 - i * 0.05).toFixed(2)});`)).join('');
  const five = await gateOf(sized(3));
  assert.equal(five.evidence.counts.sizes, 5, '3 own headline sizes + the layout\'s + the sub');
  assert.equal(five.status, 'PASS');
  const six = await gateOf(sized(4));
  assert.equal(six.evidence.counts.sizes, 6);
  assert.equal(six.status, 'WARN');
  assert.match(six.evidence.reason, /6 distinct font sizes/);
});

test('corner radii: three distinct pass, a fourth warns; a pill or a disc is one value whatever its size', async () => {
  const radius = (n) => Array.from({ length: n }, (_, i) => sub(i, `border: 1px solid var(--mm-color-canvas); border-radius: ${(i + 1) * 4}px;`)).join('');
  const three = await gateOf(radius(3));
  assert.equal(three.status, 'PASS');
  assert.deepEqual(three.evidence.values.radii, [4, 8, 12]);
  const four = await gateOf(radius(4));
  assert.equal(four.status, 'WARN');
  assert.match(four.evidence.reason, /4 distinct corner radii \(4, 8, 12, 16\) against 3/);
  const pills = await gateOf(sub(0, 'border: 1px solid var(--mm-color-canvas); border-radius: 999px;') + sub(1, 'border: 1px solid var(--mm-color-canvas); border-radius: 500px;') + sub(2, 'border: 1px solid var(--mm-color-canvas); border-radius: 50%;'));
  assert.deepEqual(pills.evidence.values.radii, ['round']);
});

test('values that draw as the same pixels are one value; one pixel apart are two', async () => {
  const r = await gateOf(sub(0, 'border: 2.2px solid var(--mm-color-canvas);') + sub(1, 'border: 2.9px solid var(--mm-color-canvas);') + sub(2, 'border: 3.4px solid var(--mm-color-canvas);'));
  assert.deepEqual(r.evidence.values.strokes, [2, 3], 'the browser draws 2.2 and 2.9 as 2 and 3.4 as 3');
});

test('a style\'s gate.tokens sets the limits, and the evidence names the ones used', async () => {
  const border = Array.from({ length: 5 }, (_, i) => sub(i, `border: ${i + 1}px solid var(--mm-color-canvas);`)).join('');
  const wide = await gateOf(border, { tokens: { strokes: 5 } });
  assert.equal(wide.status, 'PASS');
  assert.equal(wide.evidence.threshold, 'strokes 5, sizes 5, radii 3');
  const tight = await gateOf('', { tokens: { sizes: 1 } });
  assert.equal(tight.status, 'WARN');
  assert.match(tight.evidence.reason, /2 distinct font sizes/);
});

test('a deck is measured at its rests too', async () => {
  const r = row(await run('_base/deck', only), 'W-TOKENS');
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.instants >= 2);
});

test('fixtures/negatives/W-TOKENS warns W-TOKENS and nothing else', async () => {
  const r = warnsOnly(await run('W-TOKENS'), 'W-TOKENS');
  assert.deepEqual(r.evidence.counts, { strokes: 5, sizes: 6, radii: 4 });
});

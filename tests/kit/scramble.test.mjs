// The scramble plan (runtime/kit/scramble.js): a reveal schedule ranked by position, named glyph pools,
// glyphs that hold for a fixed step, hashed randomness, and a diff that steps only what changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRanges, poolOf, plan, cellsAt, hashOf, glyphOf, textAt } from '../../runtime/kit/scramble.js';

const base = { d: 1, rate: 20, settle: 0.35, hold: 0, seed: 7 };
const at = (p, lin, o = {}) => cellsAt(p, lin, Math.floor(lin * (o.d ?? base.d) * (o.rate ?? base.rate)));

test('expandRanges turns x-y into every glyph between, and keeps a leading or trailing dash', () => {
  assert.equal(expandRanges('a-e'), 'abcde');
  assert.equal(expandRanges('0-3x'), '0123x');
  assert.equal(expandRanges('-ab'), '-ab');
  assert.equal(expandRanges('ab-'), 'ab-');
  assert.equal(expandRanges('░-▓'), '░▒▓');
});

test('named pools: lowercase, uppercase, numbers, symbols, braille, blocks, shades, and a mix with +', () => {
  assert.equal(poolOf('lowercase').length, 26);
  assert.equal(poolOf('uppercase').length, 26);
  assert.equal(poolOf('numbers').join(''), '0123456789');
  assert.equal(poolOf('symbols').join(''), '!%#_|*+=');
  assert.equal(poolOf('braille').length, 256);
  assert.equal(poolOf('blocks').length, 32);
  assert.equal(poolOf('shades').join(''), '░▒▓');
  assert.equal(poolOf('letters').length, 52);
  assert.equal(poolOf('numbers+symbols').length, 18);
  assert.equal(poolOf('numbers,shades').length, 13);
});

test('a pool of the brand\'s own glyphs is split by grapheme; "own" is the line\'s letters and digits', () => {
  assert.deepEqual(poolOf('', { own: 'Hi hi' }), ['H', 'i', 'h', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(poolOf('ab✦', { own: 'xyz' }), ['a', 'b', '✦']);
  assert.deepEqual(poolOf('none'), []);
});

test('hashOf is a pure function of its three integers and changes with each', () => {
  assert.equal(hashOf(1, 2, 3), hashOf(1, 2, 3));
  assert.notEqual(hashOf(1, 2, 3), hashOf(1, 2, 4));
  assert.notEqual(hashOf(1, 2, 3), hashOf(1, 3, 3));
  assert.notEqual(hashOf(1, 2, 3), hashOf(2, 2, 3));
  assert.ok(hashOf(5, 5, 5) >= 0 && hashOf(5, 5, 5) < 2 ** 32);
});

test('a line that starts as noise: every letter is noise at 0 and the plain line at 1', () => {
  const p = plan({ ...base, after: 'Hello there' });
  assert.ok(at(p, 0).every((c) => c.state === 'noise' || c.ch === ' '));
  assert.equal(textAt(p, 1, 20, ['x']), 'Hello there');
});

test('the reveal runs left to right: the nth letter settles no later than the n+1th', () => {
  const p = plan({ ...base, after: 'abcdef', from: 'left' });
  const ends = p.cells.map((c) => c.end);
  for (let i = 1; i < ends.length; i++) assert.ok(ends[i] >= ends[i - 1], `${ends}`);
  assert.ok(ends[5] > ends[0]);
});

test('from right the order reverses, from center it runs outward from the middle', () => {
  const r = plan({ ...base, after: 'abcdef', from: 'right' }).cells.map((c) => c.end);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] <= r[i - 1]);
  const c = plan({ ...base, after: 'abcde', from: 'center' }).cells.map((x) => x.end);
  assert.ok(c[2] <= c[1] && c[2] <= c[3] && c[1] <= c[0] && c[3] <= c[4], `${c}`);
});

test('from random is a fixed shuffle of the ranks for a seed, and another for another seed', () => {
  const a = plan({ ...base, after: 'abcdefgh', from: 'random' }).cells.map((x) => x.rank).join();
  const b = plan({ ...base, after: 'abcdefgh', from: 'random' }).cells.map((x) => x.rank).join();
  const c = plan({ ...base, after: 'abcdefgh', from: 'random', seed: 8 }).cells.map((x) => x.rank).join();
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.deepEqual(a.split(',').map(Number).sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('every glyph window is the same share of the entrance, spaced by (1 - settle) / n', () => {
  const p = plan({ ...base, after: 'abcd', from: 'left', rate: 1e6 });
  const spacing = (1 - base.settle) / 4;
  p.cells.forEach((c, i) => {
    assert.ok(Math.abs(c.start - i * spacing) < 1e-9);
    assert.ok(Math.abs(c.end - (c.start + base.settle)) < 1e-4);
  });
});

test('the ends land on a glyph step, so a letter never settles between two steps', () => {
  const p = plan({ ...base, after: 'abcdefghijkl', from: 'left', rate: 20 });
  const stepShare = 1 / (20 * base.d);
  for (const c of p.cells) assert.ok(Math.abs(c.end / stepShare - Math.round(c.end / stepShare)) < 1e-6 || c.end === 1, `${c.end}`);
});

test('a glyph holds still for a step: the same step shows the same noise, the next step another', () => {
  const p = plan({ ...base, after: 'abcdefghijkl', from: 'left' });
  const g = (lin, step) => cellsAt(p, lin, step).filter((c) => c.state === 'noise').map((c) => c.h).join();
  assert.equal(g(0.011, 0), g(0.049, 0), 'steps are 1/20 s apart: 0.011 and 0.049 share step 0');
  assert.notEqual(g(0.05, 1), g(0.011, 0));
});

test('stateless: the same instants give the same cells in forward and reverse order', () => {
  const p = plan({ ...base, after: 'Ship v1.3 today', before: 'Ship v1.2 now' });
  const ls = [0, 0.1, 0.33, 0.5, 0.72, 0.9, 1];
  const shot = (l) => JSON.stringify(cellsAt(p, l, Math.floor(l * 20)));
  const fwd = ls.map(shot);
  const rev = [...ls].reverse().map(shot).reverse();
  assert.deepEqual(rev, fwd);
});

test('a version edit steps only the characters that changed: "v1.2" to "v1.3"', () => {
  const p = plan({ ...base, before: 'v1.2', after: 'v1.3' });
  assert.equal(p.prefix, 'v1.');
  for (const l of [0, 0.2, 0.5, 0.8, 0.95]) {
    const t = textAt(p, l, Math.floor(l * 20), ['x']);
    assert.ok(t.startsWith('v1.'), `${l}: ${t}`);
    assert.equal(t.length, 4);
  }
  assert.equal(textAt(p, 0, 0, ['x']), 'v1.2');
  assert.equal(textAt(p, 1, 20, ['x']), 'v1.3');
});

test('with no noise the changed character steps from the old glyph to the new one', () => {
  const p = plan({ ...base, before: 'v1.2', after: 'v1.3' });
  const seen = new Set();
  for (let i = 0; i <= 40; i++) seen.add(textAt(p, i / 40, Math.floor((i / 40) * 20), []));
  assert.deepEqual([...seen].sort(), ['v1.2', 'v1.3']);
});

test('a longer value from a shorter one grows by the length difference, a shorter one shrinks', () => {
  const grow = plan({ ...base, before: '9', after: '1250', from: 'left' });
  const lens = (p) => [0, 0.25, 0.5, 0.75, 1].map((l) => textAt(p, l, Math.floor(l * 20), ['x']).length);
  assert.equal(lens(grow)[0], 1);
  assert.equal(lens(grow)[4], 4);
  const shrink = plan({ ...base, before: 'Lemon Banana', after: 'Simple' });
  const ls = lens(shrink);
  assert.equal(ls[0], 12);
  assert.equal(ls[4], 6);
  assert.ok(ls.every((n, i) => i === 0 || n <= ls[i - 1]), `${ls}`);
});

test('auto reveals from the right when the text shrinks and from the left when it grows', () => {
  assert.equal(plan({ ...base, before: 'abcdef', after: 'ab' }).from, 'right');
  assert.equal(plan({ ...base, before: 'ab', after: 'abcdef' }).from, 'left');
  assert.equal(plan({ ...base, after: 'abc' }).from, 'left');
});

test('the shrink with a mid reveal keeps the target letters until the extras are gone', () => {
  const p = plan({ ...base, before: 'hgfedcba', after: 'abc', from: 'center' });
  const extras = p.cells.slice(3).map((c) => c.end);
  const targets = p.cells.slice(0, 3).map((c) => c.end);
  assert.ok(Math.min(...targets) >= Math.max(...extras) - 1e-9, `${targets} vs ${extras}`);
});

test('a hold keeps the finished line still for the last share of the entrance', () => {
  const p = plan({ ...base, hold: 0.15, after: 'Hello there' });
  assert.equal(textAt(p, 0.85, 17, ['x']), 'Hello there');
  assert.notEqual(textAt(p, 0.5, 10, ['x']), 'Hello there');
});

test('a reveal delay holds the start for its share, then runs the rest', () => {
  const p = plan({ ...base, delay: 0.3, after: 'Hello there', before: 'Goodbye all' });
  assert.equal(textAt(p, 0.29, 5, ['x']), 'Goodbye all');
  assert.notEqual(textAt(p, 0.6, 12, ['x']), 'Goodbye all');
});

test('a spacing character never scrambles', () => {
  const p = plan({ ...base, after: 'ab cd ef' });
  for (const l of [0.1, 0.3, 0.6]) {
    const cells = at(p, l);
    assert.ok(cells.filter((c) => c.ch === ' ').length === 2, JSON.stringify(cells));
  }
});

test('glyphOf picks from the pool by the hash and never leaves it', () => {
  const pool = ['a', 'b', 'c'];
  for (let h = 0; h < 50; h++) assert.ok(pool.includes(glyphOf(pool, hashOf(1, h, 2))));
  assert.equal(glyphOf([], 5), '');
});

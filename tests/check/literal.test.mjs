// W-LITERAL (SPEC §3, §7, AXIOM 2): a literal size, space, radius, duration or easing in the piece's CSS,
// and a literal colour or family written as syntax, advise: the brand's own studio may have reasons, and
// a literal that renders a colour the style owns stays the brand. A colour or face the style does not
// own is G-BRAND's, a failure (tests/check/brand.test.mjs). The library's patterns stay strict through
// `mm pattern lint` (tests/pattern-lint.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { cssLiterals } from '../../scripts/check/_lib.mjs';

const run = gate();

test('W-LITERAL/regex: a hex colour in piece.css that is the palette\'s own value warns with file and line, and G-BRAND passes', async () => {
  const res = await run('W-LITERAL/regex');
  const r = warnsOnly(res, 'W-LITERAL');
  assert.equal(r.evidence.file, 'piece.css');
  assert.equal(r.evidence.line, 2);
  assert.match(r.evidence.measured, /#6F675B/);
  assert.equal(row(res, 'G-BRAND').status, 'PASS', 'the colour it renders is a role');
  assert.equal(res.code, 0);
});

test('W-LITERAL/layout: a literal space, radius, duration and easing warn and block nothing', async () => {
  const res = await run('W-LITERAL/layout');
  const r = warnsOnly(res, 'W-LITERAL');
  const kinds = r.evidence.hits.map((h) => h.kind);
  for (const k of ['space literal', 'radius literal', 'duration literal', 'cubic-bezier()']) assert.ok(kinds.includes(k), `${k} in ${kinds.join(', ')}`);
  assert.equal(row(res, 'G-BRAND').status, 'PASS');
  assert.equal(res.code, 0);
});

test('the bases pass W-LITERAL: variables only', async () => {
  const res = await run('_base/film', { only: ['W-LITERAL', 'G-BRAND'] });
  assert.equal(row(res, 'W-LITERAL').status, 'PASS');
  assert.equal(row(res, 'G-BRAND').status, 'PASS');
});

test('the regexes: variables pass, literals of each kind are found', () => {
  assert.deepEqual(cssLiterals('.a { color: var(--mm-color-ink); transition: none; font-family: var(--mm-font-text); line-height: 1.05; padding: var(--mm-space-2) 0; margin: 0px; }'), []);
  assert.deepEqual(cssLiterals('.a { background: color-mix(in srgb, var(--mm-color-accent) 40%, transparent); }'), [], 'an alpha of one role is a blend');
  const kinds = cssLiterals(`.a { color: #fff; background: rgb(0 0 0); border-color: hsl(0 0% 0%); transition: opacity 300ms cubic-bezier(.2,.7,.2,1);
    font-family: Inter, sans-serif; font-size: 20px; animation-duration: 1.5s; outline-color: oklch(0.6 0.2 30); caret-color: color(srgb 1 0 0);
    fill: tomato; stroke: color-mix(in srgb, var(--mm-color-ink), var(--mm-color-accent)); padding: 12px; border-radius: 8px; --f: "Comic Sans MS", serif; }`).map((h) => h.kind);
  for (const k of ['hex colour', 'rgb()', 'hsl()', 'duration literal', 'cubic-bezier()', 'font-family not var()', 'font-size literal', 'colour function', 'color()',
    'named colour', 'color-mix() of two colours', 'space literal', 'radius literal', 'font family in a custom property']) assert.ok(kinds.includes(k), k);
});

// G-LOCAL (SPEC §2.6, Review Focus 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { gate, failsOnly } from './_harness.mjs';
import { allowedRoots } from '../../scripts/check/G-LOCAL.mjs';
import { ROOT } from '../../scripts/lib/browser.mjs';

const run = gate();

test('a network stylesheet in index.html fails G-LOCAL naming the URL', async () => {
  const r = failsOnly(await run('G-LOCAL/url'), 'G-LOCAL');
  assert.equal(r.evidence.file, 'index.html');
  assert.match(r.evidence.measured, /^https:\/\/example\.invalid\//);
});

test('Review Focus 2: a dangling font file fails G-LOCAL naming the file, never a fallback', async () => {
  const r = failsOnly(await run('G-LOCAL/font'), 'G-LOCAL');
  assert.match(r.evidence.file, /fraunces-latin-ext-700-normal-missing\.woff2$/);
  assert.ok(r.evidence.all.some((x) => /is (missing|error)/.test(x.reason)), 'the font face is reported as not loaded');
});

test('G-LOCAL/glyph: a glyph the style fonts lack is painted by a platform font', async () => {
  const r = failsOnly(await run('G-LOCAL/glyph'), 'G-LOCAL');
  assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="sub"]');
  assert.match(r.evidence.reason, /platform font/);
});

test('allowed roots: the piece, runtime/kit, runtime/vendor, patterns/, styles/fonts; fixtures/ only for fixture pieces', () => {
  const piece = join(ROOT, 'pieces', 'x');
  assert.deepEqual(allowedRoots(piece), [piece, join(ROOT, 'runtime/kit'), join(ROOT, 'runtime/vendor'), join(ROOT, 'patterns'), join(ROOT, 'styles/fonts')]);
  assert.ok(allowedRoots(join(ROOT, 'fixtures/kit-smoke/film')).includes(join(ROOT, 'fixtures')));
});

test('a dangling ground mark fails G-LOCAL naming the file', async () => {
  const r = failsOnly(await run('G-LOCAL/mark'), 'G-LOCAL');
  assert.ok(r.evidence.all?.some((x) => /mark-missing\.svg$/.test(x.file) && /ground mark/.test(x.reason)) || (/mark-missing\.svg$/.test(r.evidence.file) && /ground mark/.test(r.evidence.reason)), JSON.stringify(r.evidence).slice(0, 400));
});

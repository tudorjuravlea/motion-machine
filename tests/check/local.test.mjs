// G-LOCAL (SPEC §2.6, Review Focus 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gate, failsOnly } from './_harness.mjs';
import { allowedRoots, preparedMissing } from '../../scripts/check/G-LOCAL.mjs';
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

test('a layer pack found through its source.png must hold every file its media.json names; a plain source.png is not a pack', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-layers-'));
  const pack = join(dir, 'assets', 'scene');
  const story = (asset) => ({ scenes: [{ beats: [{ slot: 'image', asset }] }] });
  try {
    mkdirSync(pack, { recursive: true });
    const meta = { kind: 'layers', w: 4, h: 4, source: { file: 'source.png' }, plate: { file: 'plate.png' }, depth: { file: 'depth.png' },
      parts: [{ name: 'sun', file: 'part-sun.png' }, { name: 'box', file: 'part-box.png' }] };
    writeFileSync(join(pack, 'media.json'), JSON.stringify(meta));
    for (const f of ['source.png', 'plate.png', 'depth.png', 'part-sun.png']) writeFileSync(join(pack, f), 'x');
    const missing = preparedMissing(dir, story('assets/scene/source.png'));
    assert.equal(missing.length, 1, JSON.stringify(missing));
    assert.match(missing[0], /assets\/scene\/part-box\.png$/);
    writeFileSync(join(pack, 'part-box.png'), 'x');
    assert.deepEqual(preparedMissing(dir, story('assets/scene/source.png')), []);
    mkdirSync(join(dir, 'assets', 'plain'));
    writeFileSync(join(dir, 'assets', 'plain', 'source.png'), 'x');
    assert.deepEqual(preparedMissing(dir, story('assets/plain/source.png')), [], 'a source.png with no media.json beside it is an ordinary picture');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a dangling ground mark fails G-LOCAL naming the file', async () => {
  const r = failsOnly(await run('G-LOCAL/mark'), 'G-LOCAL');
  assert.ok(r.evidence.all?.some((x) => /mark-missing\.svg$/.test(x.file) && /ground mark/.test(x.reason)) || (/mark-missing\.svg$/.test(r.evidence.file) && /ground mark/.test(r.evidence.reason)), JSON.stringify(r.evidence).slice(0, 400));
});

test('a footage piece must hold media.json, edit.json and every frame the edit\'s clips show', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-footage-'));
  const talk = join(dir, 'assets', 'talk');
  const story = { footage: { asset: 'assets/talk/' }, scenes: [{ beats: [{ slot: 'headline', text: 'x' }] }] };
  const frame = (i) => `f${String(i + 1).padStart(5, '0')}.jpg`;
  try {
    mkdirSync(talk, { recursive: true });
    assert.deepEqual(preparedMissing(dir, story).map((m) => m.split('/').pop()), ['media.json', 'edit.json'], 'both manifests are named when absent');
    writeFileSync(join(talk, 'media.json'), JSON.stringify({ kind: 'sequence', fps: 10, frames: 30, w: 8, h: 8 }));
    writeFileSync(join(talk, 'edit.json'), JSON.stringify({ kind: 'edit', fps: 10, frames: 12, duration: 1.2, picture: [{ start: 0, from: 2, length: 5 }, { start: 5, from: 20, length: 7 }] }));
    // the edit shows source frames 2..6 and 20..26; frames it never shows need not travel
    for (const i of [2, 3, 4, 5, 6, 20, 21, 22, 23, 24, 25, 26]) writeFileSync(join(talk, frame(i)), 'x');
    assert.deepEqual(preparedMissing(dir, story), []);
    rmSync(join(talk, frame(23)));
    const missing = preparedMissing(dir, story);
    assert.equal(missing.length, 1, JSON.stringify(missing));
    assert.match(missing[0], /assets\/talk\/f00024\.jpg$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

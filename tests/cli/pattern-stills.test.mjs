// scripts/pattern-stills.mjs: scaffolds a temporary piece beside the demo, photographs every rest
// and mid-entrance in the given style, writes demo/out/<style>-contact.png and the frames, and
// removes the scaffold. The fixture's stub patterns stand in for a library pattern.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, mm, workCopy } from './cli-helpers.mjs';
import { pngSize } from '../../scripts/lib/sheet.mjs';
import { readFileSync } from 'node:fs';

let w, demo;
before(() => {
  w = workCopy('pattern-stills');
  demo = join(w.patterns, 'entrances', 'rise', 'demo');
  mkdirSync(demo, { recursive: true });
  cpSync(join(w.film, 'story.json'), join(demo, 'story.json'));
});
after(() => w.cleanup());

const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'pattern-stills.mjs'), ...args], { encoding: 'utf8', timeout: 120_000 });

test('writes <style>-contact.png and the frames; the scaffold is removed', () => {
  const r = run('entrances/rise', '--style', 'styles/presets/editorial.json', '--format', '16x9', '--patterns', relative(process.cwd(), w.patterns));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const contact = join(demo, 'out', 'editorial-contact.png');
  assert.ok(existsSync(contact));
  const { width } = pngSize(readFileSync(contact));
  assert.equal(width, 12 * 2 + 4 * 480 + 3 * 12);
  const frames = readdirSync(join(demo, 'out', 'editorial'));
  assert.equal(frames.length, 6, `2 rests + 4 mid-entrances: ${frames.join(', ')}`);
  assert.ok(!existsSync(join(demo, 'out', '.piece')), 'the temporary piece is gone');
  assert.match(r.stdout, /2 rests, 4 mid-entrances/);
});

test('--style all runs the three presets; a missing demo or bad name exits 2', () => {
  let r = run('entrances/rise', '--style', 'all', '--patterns', relative(process.cwd(), w.patterns));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const p of ['editorial', 'kinetic', 'calm-product']) assert.ok(existsSync(join(demo, 'out', `${p}-contact.png`)), p);
  r = run('entrances/fade', '--style', 'editorial', '--patterns', relative(process.cwd(), w.patterns));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /demo\/story\.json not found/);
  r = run('nonsense');
  assert.equal(r.status, 2);
});

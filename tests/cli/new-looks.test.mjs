// `mm new` with no style, preset or brand reads the last eight sibling pieces and picks the preset used least,
// and does not scaffold an opening the recent pieces all share. Explicit choices always win.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOOK_LAYOUTS, chooseLook, newPiece, recentPieces } from '../../scripts/new.mjs';
import { ROOT, mm, readJson } from './cli-helpers.mjs';

const PRESETS = ['blueprint', 'calm-product', 'editorial', 'kinetic'];
const piece = (preset, layout) => ({ id: `${preset}-${layout}`, preset, layout });
const work = join(ROOT, `.tmp-cli-newlooks-${process.pid}`);
after(() => rmSync(work, { recursive: true, force: true }));

test('the least-used preset among the recent pieces wins; ties go to the name', () => {
  const recent = [piece('editorial', 'layouts/statement'), piece('editorial', 'layouts/statement'), piece('kinetic', 'layouts/statement'), piece('blueprint', 'layouts/statement')];
  const c = chooseLook(recent, { presets: PRESETS });
  assert.equal(c.preset, 'calm-product', 'unused beats used');
  assert.match(c.why, /calm-product/);
  assert.equal(chooseLook([piece('editorial', 'layouts/statement')], { presets: PRESETS }).preset, 'blueprint', 'tie by name');
  assert.equal(chooseLook([], { presets: PRESETS }).preset, 'blueprint', 'no history: first by name');
  assert.deepEqual(chooseLook(recent, { presets: PRESETS }), chooseLook(recent, { presets: PRESETS }), 'deterministic');
});

test('a preset a recent piece does not use through a name outside the shipped presets is ignored', () => {
  assert.equal(chooseLook([piece('mine', 'layouts/statement')], { presets: PRESETS }).preset, 'blueprint');
});

test('the hook is not the layout that more than half of the last eight opened on', () => {
  const eight = (layout, n) => Array.from({ length: 8 }, (_, i) => piece('editorial', i < n ? layout : 'layouts/media'));
  assert.notEqual(chooseLook(eight('layouts/title-stack', 5), { presets: PRESETS, defaultLayout: 'layouts/title-stack' }).hookLayout, 'layouts/title-stack', 'five of eight');
  assert.equal(chooseLook(eight('layouts/title-stack', 4), { presets: PRESETS, defaultLayout: 'layouts/title-stack' }).hookLayout, 'layouts/title-stack', 'four of eight is not more than half');
  const c = chooseLook(eight('layouts/statement', 6), { presets: PRESETS, defaultLayout: 'layouts/title-stack' });
  assert.equal(c.hookLayout, 'layouts/title-stack', 'the skeleton default stays when it is not the crowded one');
  const crowded = chooseLook(eight('layouts/statement', 6), { presets: PRESETS, defaultLayout: 'layouts/statement' });
  assert.notEqual(crowded.hookLayout, 'layouts/statement');
  assert.ok(HOOK_LAYOUTS.includes(crowded.hookLayout));
});

test('recentPieces reads the last eight stories by file time, newest first, skipping the catalogue and other kinds', () => {
  const pieces = join(work, 'pieces');
  for (let i = 0; i < 10; i++) {
    const dir = join(pieces, `p${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'story.json'), JSON.stringify({ id: `p${i}`, kind: 'film', scenes: [{ layout: i % 2 ? 'layouts/quote' : 'layouts/statement' }] }));
    writeFileSync(join(dir, 'style.json'), JSON.stringify({ name: i % 2 ? 'kinetic' : 'editorial' }));
    utimesSync(join(dir, 'story.json'), 1000 + i, 1000 + i);
  }
  mkdirSync(join(pieces, 'catalogue-x'), { recursive: true });
  writeFileSync(join(pieces, 'catalogue-x/story.json'), JSON.stringify({ id: 'catalogue-x', kind: 'film', scenes: [{ layout: 'layouts/media' }] }));
  mkdirSync(join(pieces, 'deck1'), { recursive: true });
  writeFileSync(join(pieces, 'deck1/story.json'), JSON.stringify({ id: 'deck1', kind: 'deck', scenes: [{ layout: 'layouts/media' }] }));
  const r = recentPieces(work, 'film');
  assert.deepEqual(r.map((p) => p.id), ['p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2']);
  assert.deepEqual(r[0], { id: 'p9', preset: 'kinetic', layout: 'layouts/quote' });
});

test('mm new with no style picks a look and says why; an explicit --style wins and is not second-guessed', () => {
  const auto = join(work, 'auto');
  const r = mm(['new', '--kind', 'film', '--dir', auto]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /look: .* \(chosen/);
  const style = readJson(join(auto, 'style.json'));
  assert.ok(existsSync(join(ROOT, 'styles/presets', `${style.name}.json`)), style.name);
  const explicit = join(work, 'explicit');
  const e = mm(['new', '--kind', 'film', '--style', 'editorial', '--dir', explicit]);
  assert.equal(e.status, 0, e.out);
  assert.equal(readJson(join(explicit, 'style.json')).name, 'editorial');
  assert.doesNotMatch(e.out, /chosen/);
  const p = join(work, 'viapreset');
  assert.equal(mm(['new', '--kind', 'film', '--preset', 'blueprint', '--dir', p]).status, 0);
  assert.equal(readJson(join(p, 'style.json')).name, 'blueprint');
});

test('--brand wins: it composes the brand with a motion half', () => {
  const dir = join(work, 'brand');
  const r = mm(['new', '--kind', 'film', '--brand', 'paper', '--motion', 'grid', '--dir', dir]);
  assert.equal(r.status, 0, r.out);
  const s = readJson(join(dir, 'style.json'));
  assert.equal(s.from.brand, 'styles/brands/paper.json');
  assert.equal(s.from.motion, 'styles/motion/grid.json');
  assert.ok(s.essence, 'the motion brief travels');
});

test('newPiece rewrites the first scene layout when told to; the scaffold keeps a valid headline beat', () => {
  const dir = newPiece({ kind: 'film', style: 'editorial', dir: join(work, 'hooked'), hookLayout: 'layouts/quote' });
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  assert.equal(story.scenes[0].layout, 'layouts/quote');
  assert.equal(story.scenes[0].beats[0].slot, 'headline');
});

test('every hook layout exists and has a headline slot', () => {
  for (const l of HOOK_LAYOUTS) assert.match(readFileSync(join(ROOT, 'patterns', `${l}/pattern.html`), 'utf8'), /data-slot="headline"/, l);
});

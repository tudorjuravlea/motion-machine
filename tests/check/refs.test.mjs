// G-PATTERN-REF · G-FACT-REF (SPEC §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, NEG } from './_harness.mjs';

const run = gate();

test('an fx that names no pattern fails G-PATTERN-REF', async () => {
  const r = failsOnly(await run('G-PATTERN-REF'), 'G-PATTERN-REF');
  assert.equal(r.evidence.measured, 'entrances/shimmer');
  assert.equal(r.evidence.selector, 'style.sub.fx');
});

test('a beat citing an unknown fact fails G-FACT-REF', async () => {
  const r = failsOnly(await run('G-FACT-REF'), 'G-FACT-REF');
  assert.equal(r.evidence.measured, 'f7');
});

test('a screen action naming a mark its screen does not carry fails G-PATTERN-REF statically, naming the beat and the mark', async () => {
  // the phone-and-screen piece draws four corner radii, which W-TOKENS (limit 3) notes: not this defect
  const r = failsOnly(await run('G-PATTERN-REF/mark'), 'G-PATTERN-REF', { inherent: ['W-TOKENS'] });
  assert.match(r.evidence.reason, /\[data-scene="style"\] \[data-slot="stage"\]: screen\/tap names mark "Prise"/);
});

test('screen warnings from the kit or the schedule make G-PATTERN-REF warn', async () => {
  const { default: refRule } = await import('../../scripts/check/G-PATTERN-REF.mjs');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(NEG, '_base/film');
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const base = { dir, story, patternsBase: join(NEG, '_shared/patterns'), schedule: { warnings: ['screen: [data-scene="a"] [data-slot="stage"]: screen/tap step 3 beyond the scene\'s 2 presses; it plays on the last'] },
    meta: { warnings: ['screen: [data-scene="a"] [data-slot="x"]: screen actions or a folder asset on a slot with no [data-screen]; nothing is drawn', 'unknown slot: not a screen warning'] } };
  const r = await refRule(base);
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all.length, 2);
  assert.match(r.evidence.reason, /step 3 beyond/);
  assert.equal((await refRule({ ...base, schedule: { warnings: [] }, meta: { warnings: [] } })).status, 'PASS');
});

test('a sample fact with no visible data-sample label where it shows fails G-FACT-REF; with one it passes', async () => {
  const r = failsOnly(await run('G-FACT-REF/sample'), 'G-FACT-REF');
  assert.match(r.evidence.reason, /f1 is sample data.*data-sample/);
  const { cpSync, rmSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const copy = join(NEG, 'G-FACT-REF', `.tmp-labelled-${process.pid}`);
  rmSync(copy, { recursive: true, force: true });
  cpSync(join(NEG, 'G-FACT-REF/sample'), copy, { recursive: true, filter: (p) => !p.includes('/out') });
  try {
    writeFileSync(join(copy, 'piece.js'), "export function after() { const p = document.createElement('p'); p.dataset.sample = ''; p.dataset.keep = ''; p.textContent = 'Illustrative'; document.querySelector('.mm-stage').append(p); }\n");
    const ok = await run(copy, { only: ['G-FACT-REF'] });
    assert.equal(ok.rules[0].status, 'PASS', JSON.stringify(ok.rules[0]));
    // review: a label outside the stage does not count
    writeFileSync(join(copy, 'piece.js'), "export function after() { const p = document.createElement('p'); p.dataset.sample = ''; p.dataset.keep = ''; p.textContent = 'Illustrative'; p.style.cssText = 'position:absolute;left:-5000px;top:0'; document.querySelector('.mm-stage').append(p); }\n");
    const off = await run(copy, { only: ['G-FACT-REF'] });
    assert.equal(off.rules[0].status, 'FAIL', JSON.stringify(off.rules[0]));
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('a portrait variant naming no pattern fails G-PATTERN-REF: the gate reads each format\'s scenes', async () => {
  const r = failsOnly(await run('G-PATTERN-REF/variant'), 'G-PATTERN-REF');
  assert.equal(r.evidence.measured, 'entrances/shimmer');
});

test('a cue no folder of patterns/sound/ holds fails G-PATTERN-REF; a code cue and a recipe cue both resolve', async () => {
  const { default: refRule } = await import('../../scripts/check/G-PATTERN-REF.mjs');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(NEG, '_base/film');
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const withCue = (cue) => { const s = structuredClone(story); s.scenes[0].beats[0].cue = cue; return { dir, story: s, patternsBase: join(NEG, '_shared/patterns'), schedule: { warnings: [] }, meta: { warnings: [] } }; };
  const bad = await refRule(withCue('boom'));
  assert.equal(bad.status, 'FAIL');
  assert.equal(bad.evidence.measured, 'sound/boom');
  assert.match(bad.evidence.reason, /no cue boom: patterns\/sound\/boom\/ holds neither pattern\.js nor recipe\.json/);
  assert.match(bad.evidence.selector, /\.cue$/);
  for (const ok of ['hit', 'ready', 'toggle-on']) assert.equal((await refRule(withCue(ok))).status, 'PASS', ok);
});

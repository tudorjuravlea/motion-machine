// The live gate. scripts/check/timing.mjs runs the rules whose verdict
// needs only the schedule, the story and the style, in Node and in a browser. Proofs here: the
// verdicts recorded before any rule moved (fixtures/timing-snapshot.json) still come out of the
// gate's rule files and out of timingRules; nothing in timing.mjs's import graph is a Node built-in
// or a bare package; floors() gives the duration at which W-READ starts and stops warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { loadGrid } from '../../scripts/sound.mjs';
import { TIMING_IDS, timingRules, floors } from '../../scripts/check/timing.mjs';
import { SNAPSHOT_FILE, SNAPSHOT_IDS, pieceDirs, prepare, snapshotFromRules, stripRoot } from './_timing-snapshot.mjs';
import { importGraph, specifiers } from './_import-graph.mjs';

const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));

test('the snapshot covers every film, loop and deck in pieces/, and the branch fixtures, in every format', () => {
  assert.deepEqual(Object.keys(snapshot).sort(), pieceDirs().sort());
  for (const rel of pieceDirs()) {
    const story = JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
    assert.deepEqual(Object.keys(snapshot[rel]).sort(), [...story.formats].sort(), rel);
    for (const rows of Object.values(snapshot[rel])) assert.deepEqual(rows.map((r) => r.id), SNAPSHOT_IDS, rel);
  }
  const kinds = new Set(pieceDirs().map((rel) => JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8')).kind));
  assert.deepEqual([...kinds].sort(), ['deck', 'film', 'loop']);
  assert.ok(!JSON.stringify(snapshot).includes(ROOT), 'no absolute path in the fixture');
});

test('TIMING_IDS is the snapshot set, in the gate order', () => {
  assert.deepEqual(TIMING_IDS, SNAPSHOT_IDS);
});

test('the gate\'s rule files still give the recorded verdicts (mm check runs the same files)', async () => {
  assert.deepEqual(await snapshotFromRules(), snapshot);
});

test('timingRules gives the recorded verdicts for every piece and format (grid from audio.beats)', async () => {
  for (const rel of pieceDirs()) {
    for (const [f, ctx] of Object.entries(await prepare(rel))) {
      const grid = loadGrid(ctx.dir, ctx.story);
      const rows = await timingRules({ schedule: ctx.schedule, story: ctx.story, style: ctx.style, grid });
      assert.deepEqual(stripRoot(rows), snapshot[rel][f], `${rel} ${f}`);
    }
  }
});

test('timingRules without ctx.grid: a story that declares a grid and has cues SKIPs W-CUE, one without a grid matches', async () => {
  const ctx = (await prepare('pieces/golden-film-kinetic'))['16x9'];
  const rows = await timingRules({ schedule: ctx.schedule, story: ctx.story, style: ctx.style });
  const cue = rows.find((r) => r.id === 'W-CUE');
  assert.equal(cue.status, 'SKIP');
  assert.match(cue.evidence.reason, /ctx\.grid/);
  const plain = (await prepare('pieces/catalogue-sound-1'))['16x9'];
  const rows2 = await timingRules({ schedule: plain.schedule, story: plain.story, style: plain.style });
  assert.deepEqual(stripRoot(rows2), snapshot['pieces/catalogue-sound-1']['16x9']);
});

// The static walk lives in ./_import-graph.mjs.
test('timing.mjs imports no node: built-in and no bare package, at any depth', () => {
  const { files, bad } = importGraph(join(ROOT, 'scripts', 'check', 'timing.mjs'));
  assert.deepEqual(bad, []);
  for (const f of ['scripts/check/W-DEAD.mjs', 'scripts/check/W-READ.mjs', 'scripts/check/W-ASK.mjs', 'scripts/check/_pure.mjs', 'scripts/lib/rule.mjs']) assert.ok(files.includes(f), `${f} is in the graph`);
});

test('the import walk catches a node: import and a bare import (it is not vacuous)', () => {
  assert.deepEqual(specifiers("import { a } from 'node:fs';\nimport b from 'ajv';\nexport { c } from './c.mjs';\nconst d = await import('./d.mjs');"), ['node:fs', 'ajv', './c.mjs', './d.mjs']);
  const { bad } = importGraph(join(ROOT, 'scripts', 'check', '_lib.mjs'));
  assert.ok(bad.some((b) => b.includes('node:fs')) && bad.some((b) => b.includes('ajv')), bad.join('\n'));
});

// floors(): the shortest scene duration that keeps W-READ passing, and the dead windows.
async function withDuration(rel, format, sceneId, duration) {
  const story = JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
  const sc = story.scenes.find((s) => s.id === sceneId);
  sc.duration = duration;
  return (await prepare(rel, { story }))[format];
}
const readOf = async (ctx) => (await timingRules({ schedule: ctx.schedule, story: ctx.story, style: ctx.style, grid: { beats: null, declared: false } })).find((r) => r.id === 'W-READ');

for (const [rel, format] of [['pieces/demo-film', '16x9'], ['pieces/golden-film-editorial', '9x16'], ['pieces/catalogue-text-1', '16x9']]) {
  test(`floors: ${rel} ${format}, every scene at minDuration passes W-READ and 0.01 s under it warns`, async () => {
    const ctx = (await prepare(rel))[format];
    assert.equal((await readOf(ctx)).status, 'PASS', 'the piece reads as written');
    const { scenes } = floors(ctx.schedule, ctx.story, ctx.style);
    assert.deepEqual(scenes.map((s) => s.id), ctx.story.scenes.map((s) => s.id));
    for (const s of scenes) {
      assert.equal(typeof s.minDuration, 'number', `${s.id}: ${s.reason}`);
      assert.ok(s.minDuration <= ctx.story.scenes.find((x) => x.id === s.id).duration + 1e-9, `${s.id} ${s.minDuration} fits its current duration`);
      assert.ok(Math.abs(s.minDuration * 100 - Math.round(s.minDuration * 100)) < 1e-6, `${s.minDuration} is rounded to 0.01 s`);
      assert.ok(s.reason.length > 0);
      const at = await readOf(await withDuration(rel, format, s.id, s.minDuration));
      assert.equal(at.status, 'PASS', `${s.id} at ${s.minDuration}: ${at.evidence.reason ?? ''}`);
      const under = await readOf(await withDuration(rel, format, s.id, Math.round((s.minDuration - 0.01) * 100) / 100));
      assert.equal(under.status, 'WARN', `${s.id} at ${s.minDuration - 0.01} should warn`);
      assert.ok(under.evidence.selector, 'it names a selector');
    }
  });
}

test('floors: a line that exits too early has no duration that fixes it (minDuration null, reason names it)', async () => {
  const rel = 'pieces/demo-film', format = '16x9';
  const story = JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
  const sc = story.scenes[0];
  const beat = sc.beats.find((b) => b.text && b.text.trim().split(/\s+/).length >= 1);
  beat.out = beat.at + 0.05;
  const ctx = (await prepare(rel, { story }))[format];
  const s = floors(ctx.schedule, ctx.story, ctx.style).scenes.find((x) => x.id === sc.id);
  assert.equal(s.minDuration, null);
  assert.match(s.reason, /exit/);
});

test('floors: a deck has no scene floors and no dead windows', async () => {
  const ctx = (await prepare('pieces/demo-deck'))['16x9'];
  assert.deepEqual(floors(ctx.schedule, ctx.story, ctx.style), { scenes: [], dead: [] });
});

test('floors: dead lists the windows W-DEAD warns on, and none on a passing film', async () => {
  const rel = 'pieces/demo-film', format = '16x9';
  const ctx = (await prepare(rel))[format];
  assert.deepEqual(floors(ctx.schedule, ctx.story, ctx.style).dead, []);
  const story = JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
  const last = story.scenes[story.scenes.length - 1];
  last.duration += 6;
  const long = (await prepare(rel, { story }))[format];
  const rows = await timingRules({ schedule: long.schedule, story: long.story, style: long.style, grid: { beats: null, declared: false } });
  const dead = rows.find((r) => r.id === 'W-DEAD');
  assert.equal(dead.status, 'WARN');
  const { dead: windows } = floors(long.schedule, long.story, long.style);
  assert.ok(windows.length >= 1);
  assert.ok(windows.every((w) => w.gap > 4 && w.to - w.from > 4));
  assert.ok(windows.some((w) => w.from === dead.evidence.instant && w.gap === dead.evidence.measured));
});

// Regenerating the fixture is a deliberate act: UPDATE_TIMING_SNAPSHOT=1 node --test tests/check/timing.test.mjs
if (process.env.UPDATE_TIMING_SNAPSHOT === '1') {
  test('rewrite the timing snapshot', async () => { writeFileSync(SNAPSHOT_FILE, JSON.stringify(await snapshotFromRules(), null, 1) + '\n'); });
}

test('the snapshot reaches every timing rule\'s WARN or FAIL branch, a variant with beats and an autoReturn loop', () => {
  for (const id of SNAPSHOT_IDS) {
    const hit = Object.values(snapshot).some((fs) => Object.values(fs).some((rows) => rows.some((r) => r.id === id && (r.status === 'WARN' || r.status === 'FAIL'))));
    assert.ok(hit, `${id} never warns or fails in the snapshot`);
  }
  const raw = (rel) => JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
  const rels = Object.keys(snapshot);
  assert.ok(rels.some((rel) => raw(rel).scenes.some((sc) => Object.values(sc.variants ?? {}).some((v) => Array.isArray(v.beats)))), 'a variant with its own beats');
  assert.ok(rels.some((rel) => raw(rel).autoReturn), 'an autoReturn loop');
});

test('grid: null is "not passed", not "audio.beats is null"', async () => {
  const ctx = (await prepare('pieces/golden-film-kinetic'))['16x9'];
  const cue = (await timingRules({ schedule: ctx.schedule, story: ctx.story, style: ctx.style, grid: null })).find((r) => r.id === 'W-CUE');
  assert.equal(cue.status, 'SKIP');
  assert.match(cue.evidence.reason, /was not passed in ctx\.grid/);
});

test('a missing beat grid: Node\'s loadGrid and the browser recipe give the same evidence (the story-relative path)', async () => {
  const ctx = (await prepare('pieces/golden-film-kinetic'))['16x9'];
  const story = { ...ctx.story, audio: { ...ctx.story.audio, beats: 'assets/nope.json' } };
  const node = loadGrid(ctx.dir, story);
  assert.deepEqual(node, { beats: null, declared: true, missing: 'assets/nope.json' });
  const run = async (grid) => (await timingRules({ schedule: ctx.schedule, story, style: ctx.style, grid })).find((r) => r.id === 'W-CUE');
  const web = await run({ beats: null, declared: true, missing: story.audio.beats });
  assert.deepEqual(await run(node), web);
  assert.equal(web.status, 'WARN');
  assert.equal(web.evidence.file, 'assets/nope.json');
});

test('suspicion 1: a rule that throws is one crashed row, as in mm check; the other rules still run', async () => {
  const ctx = (await prepare('pieces/demo-film'))['16x9'];
  const rows = await timingRules({ schedule: ctx.schedule, story: { ...ctx.story, scenes: null }, style: ctx.style, grid: { beats: null, declared: false } });
  assert.deepEqual([...new Set(rows.map((r) => r.id))], TIMING_IDS, 'a row per rule, in order');
  const crashed = rows.filter((r) => r.evidence.crash);
  assert.ok(crashed.length >= 1);
  for (const r of crashed) {
    assert.deepEqual(Object.keys(r).sort(), ['evidence', 'id', 'status']);
    assert.equal(r.status, r.id.startsWith('G-') ? 'FAIL' : 'WARN');
    assert.match(r.evidence.reason, /^rule crashed: /);
  }
  assert.ok(rows.some((r) => !r.evidence.crash), 'the rules that do not read scenes still give verdicts');
});

test('floors reads W-READ\'s own halves (sceneNeed, lineEnd), not a copy', async () => {
  const W = await import('../../scripts/check/W-READ.mjs');
  assert.equal(typeof W.sceneNeed, 'function');
  assert.equal(typeof W.lineEnd, 'function');
  const src = readFileSync(join(ROOT, 'scripts', 'check', 'timing.mjs'), 'utf8');
  assert.match(src, /import wRead, \{[^}]*\bsceneNeed\b[^}]*\blineEnd\b[^}]*\} from '\.\/W-READ\.mjs'/);
  assert.doesNotMatch(src, /PER_WORD_S\s*\+|\* PER_WORD_S/, 'no second copy of the per-word formula');
  const ctx = (await prepare('pieces/demo-film'))['16x9'];
  const sc = ctx.story.scenes[0];
  const need = W.sceneNeed(sc);
  assert.equal(need.need, need.words * W.PER_WORD_S + need.lastAt);
  const it = ctx.schedule.items.find((x) => x.scene === sc.id && !x.parent);
  assert.equal(W.lineEnd(it, ctx.schedule), it.exit ? it.exit.start : ctx.schedule.scenes[0].end);
});

// A one-line scene ("Hi" rising in at 0.5 s): below minDuration W-READ warns, or the line is still
// arriving at the scene's end (W-SCENE-END's defect, which W-READ leaves alone). That is what the floor means.
const hiStory = (d) => {
  const s = JSON.parse(readFileSync(join(ROOT, 'fixtures/negatives/_base/variants/story.json'), 'utf8'));
  s.scenes[0].beats = [{ at: 0.5, slot: 'headline', fx: 'entrances/rise', text: 'Hi' }];
  s.scenes[0].duration = d;
  return s;
};

test('below minDuration a scene warns or its line is still arriving when it ends; "1 word", not "1 words"', async () => {
  const rel = 'fixtures/negatives/_base/variants';
  const ctx = (await prepare(rel, { story: hiStory(5) }))['16x9'];
  const f = floors(ctx.schedule, ctx.story, ctx.style).scenes[0];
  assert.doesNotMatch(f.reason, /\b1 words\b/, f.reason);
  for (const d of [f.minDuration - 0.01, 1.2, 0.9, 0.8]) {
    const c = (await prepare(rel, { story: hiStory(Math.round(d * 100) / 100) }))['16x9'];
    const it = c.schedule.items.find((x) => x.scene === 'open');
    const arriving = it.start + it.d >= c.schedule.scenes[0].end - 1e-9;
    assert.ok((await readOf(c)).status === 'WARN' || arriving, `at ${d} W-READ passes and the line has settled`);
  }
  const src = readFileSync(join(ROOT, 'scripts', 'check', 'timing.mjs'), 'utf8');
  assert.match(src, /still arriving/, 'the floors doc says what the floor means');
});

test('floors refuses a story that still has variants (it takes the resolved story of one format)', async () => {
  const rel = 'fixtures/negatives/_base/variants';
  const ctx = (await prepare(rel))['9x16'];
  const raw = JSON.parse(readFileSync(join(ROOT, rel, 'story.json'), 'utf8'));
  assert.throws(() => floors(ctx.schedule, raw, ctx.style), /resolved story/);
  assert.ok(floors(ctx.schedule, ctx.story, ctx.style).scenes.length);
});

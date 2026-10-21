// `mm beats` on a synthetic 120 BPM click track (ffmpeg aevalsrc, first click at
// 0.25 s, accent on every fourth beat): tempo within 0.5 BPM and beats within 20 ms without a
// declared tempo; with --bpm 120 the downbeat offset within 10 ms.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, CLICK_OFFSET, ensureClick, ensureClickAt, ensureMusic, trueBeats } from '../../fixtures/sound/setup.mjs';
import { detectBeats, main } from '../../scripts/beats.mjs';

let click;
before(() => { click = ensureClick(); });

const nearestErr = (t, truth) => Math.min(...truth.map((x) => Math.abs(x - t)));

test('estimated tempo: bpm within 0.5 and every beat within 20 ms of the truth', async () => {
  const r = await detectBeats(click);
  assert.ok(Math.abs(r.bpm - 120) <= 0.5, `bpm ${r.bpm}`);
  const truth = trueBeats();
  assert.equal(r.beats.length, truth.length);
  for (const t of r.beats) assert.ok(nearestErr(t, truth) <= 0.02, `beat ${t} is ${nearestErr(t, truth)} s from the grid`);
  assert.ok(Math.abs(r.downbeats[0] - CLICK_OFFSET) <= 0.02, `accented beat found at ${r.downbeats[0]}`);
  assert.deepEqual(Object.keys(r).filter((k) => ['bpm', 'beats', 'downbeats', 'hits'].includes(k)).sort(), ['beats', 'bpm', 'downbeats', 'hits']);
  assert.ok(r.hits.length >= truth.length && r.hits.every((h) => typeof h.t === 'number' && h.strength > 0 && h.strength <= 1));
});

test('strong cues: the accented downbeats rank first, every cue scores 0.45 or more, cues are 0.18 s apart (brag)', async () => {
  const r = await detectBeats(click);
  assert.ok(Array.isArray(r.strong) && r.strong.length >= 4, `strong: ${JSON.stringify(r.strong)}`);
  for (const c of r.strong) {
    assert.equal(typeof c.t, 'number');
    assert.ok(c.intensity >= 0.45 && c.intensity <= 1, `intensity ${c.intensity}`);
    assert.ok(['beat', 'onset'].includes(c.kind), `kind ${c.kind}`);
  }
  for (let i = 1; i < r.strong.length; i++) assert.ok(r.strong[i].t - r.strong[i - 1].t >= 0.18 - 1e-9, `cues ${r.strong[i - 1].t} and ${r.strong[i].t} are closer than 0.18 s`);
  const top = [...r.strong].sort((a, b) => b.intensity - a.intensity).slice(0, 4).map((c) => c.t).sort((a, b) => a - b);
  const accents = trueBeats().filter((_, k) => k % 4 === 0);
  assert.equal(top.length, accents.length);
  top.forEach((t, i) => assert.ok(Math.abs(t - accents[i]) <= 0.02, `strongest cue ${i} at ${t}, the accent is at ${accents[i]}`));
});

test('declared --bpm 120: the downbeat offset is within 10 ms of 0.25 s and the tempo is the declared one', async () => {
  const r = await detectBeats(click, { bpm: 120 });
  assert.equal(r.bpm, 120);
  assert.ok(Math.abs(r.downbeats[0] - CLICK_OFFSET) <= 0.01, `downbeat at ${r.downbeats[0]}`);
  assert.ok(Math.abs(r.offsetS - CLICK_OFFSET) <= 0.01);
  r.downbeats.forEach((d, i) => assert.ok(Math.abs(d - (CLICK_OFFSET + 2 * i)) <= 0.01, `downbeat ${i}: ${d}`));
  r.beats.forEach((b, i) => assert.ok(Math.abs(b - (CLICK_OFFSET + 0.5 * i)) <= 0.01));
});

test('another tempo (100 BPM, first click at 0.4 s) is estimated within 0.5 BPM, and a pad-heavy track keeps its downbeats', async () => {
  const r = await detectBeats(ensureClickAt(100));
  assert.ok(Math.abs(r.bpm - 100) <= 0.5, `bpm ${r.bpm}`);
  r.beats.forEach((b, i) => assert.ok(Math.abs(b - (0.4 + 0.6 * i)) <= 0.02, `beat ${i}: ${b}`));
  const m = await detectBeats(ensureMusic());
  assert.ok(Math.abs(m.bpm - 120) <= 0.5, `bpm ${m.bpm}`);
  assert.ok(Math.abs(m.downbeats[0] - CLICK_OFFSET) <= 0.02);
});

test('the CLI writes { bpm, beats, downbeats, hits } to --out and rejects bad usage with exit 2', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'mm-beats-')), 'nested', 'beats.json');
  const ok = spawnSync('node', [join(ROOT, 'scripts/beats.mjs'), click, '--bpm', '120', '--out', out], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(j.bpm, 120);
  assert.ok(j.beats.length > 10 && j.downbeats.length >= 3);
  assert.equal(await main([]), 2);
  assert.equal(await main([click, '--bpm', '500']), 2);
  assert.equal(await main([join(tmpdir(), 'mm-no-such-file.wav'), '--out', out]), 2, 'a missing input is a setup error');
});

test('a silent file has no pulse and is reported, not guessed', async () => {
  await assert.rejects(() => detectBeats(join(ROOT, 'fixtures/kit-smoke/film/index.html')), /decode|ffmpeg/);
});

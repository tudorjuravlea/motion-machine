// `mm sound-listen`: the page a person listens to. Every recipe under every profile and emphasis is a player with its
// measured numbers beside it, the code cues are there for comparison, nothing is fetched from the network, and the
// shipped recipes are calibrated (re-calibrating changes nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildListen, calibratedGain, calibrateAll, recipeCues, variantsOf, wavOf } from '../../scripts/sound-listen.mjs';

test('every shipped recipe is calibrated: its masterGain is the one --calibrate would write', () => {
  for (const c of recipeCues()) {
    const want = calibratedGain(c.recipe);
    assert.ok(Math.abs(c.recipe.masterGain - want) / want < 0.005, `${c.name}: masterGain ${c.recipe.masterGain}, calibration says ${want}`);
  }
});

test('--calibrate rewrites only masterGain, and adds it when a recipe has none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-calibrate-'));
  try {
    const base = join(dir, 'sound', 'probe');
    const recipe = { name: 'probe', meaning: 'a probe for the tests', durationS: 0.3, layers: [{ kind: 'tone', f: 1000, attackS: 0.002, t60: 0.2, peak: 1 }] };
    const put = (r) => { mkdirSync(base, { recursive: true }); writeFileSync(join(base, 'recipe.json'), `${JSON.stringify(r, null, 2)}\n`); };
    put(recipe);
    const [done] = calibrateAll({ patterns: dir });
    const after = JSON.parse(readFileSync(join(base, 'recipe.json'), 'utf8'));
    assert.equal(after.masterGain, done.masterGain);
    assert.deepEqual({ ...after, masterGain: undefined }, { ...recipe, masterGain: undefined });
    assert.ok(Math.abs(calibratedGain({ ...after, masterGain: 1 }) - after.masterGain) < 1e-9);
    put({ ...recipe, masterGain: 0.001 });
    calibrateAll({ patterns: dir });
    assert.equal(JSON.parse(readFileSync(join(base, 'recipe.json'), 'utf8')).masterGain, done.masterGain, 'and it finds the same gain from any start');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the listen page: a player and numbers for every cue, profile and emphasis, the bands marked, no network', async () => {
  const out = mkdtempSync(join(tmpdir(), 'mm-listen-'));
  try {
    const res = await buildListen({ out });
    const html = readFileSync(join(out, 'listen.html'), 'utf8');
    // a cue with versions has a row and a set of files for each (the first named is the base and keeps the cue's plain name)
    const rows = recipeCues().flatMap((c) => variantsOf(c.recipe).map((v) => ({ name: c.name, label: v ? `${c.name} (${v})` : c.name, stem: v === null || v === (c.recipe.variant ?? Object.keys(c.recipe.variants)[0]) ? c.name : `${c.name}-${v}` })));
    assert.equal(res.records.filter((r) => !r.code).length, rows.length * 2 * 3);
    for (const { label, stem } of rows) {
      assert.match(html, new RegExp(`<b>${label.replace(/[()]/g, '\\$&')}</b>`), `${label} has a row`);
      for (const p of ['glass', 'soft-ui']) for (const e of ['', '-subtle', '-strong']) assert.ok(existsSync(join(out, 'wav', `${stem}-${p}${e}.wav`)), `${stem}-${p}${e}.wav`);
    }
    assert.ok((html.match(/<audio /g) ?? []).length >= rows.length * 6, 'a player each');
    assert.match(html, /loudest 100 ms <span class="ok"><b>-30(\.\d)?<\/b> LUFS/);
    assert.match(html, /left−right/);
    assert.match(html, /The code cues, for comparison/);
    assert.doesNotMatch(html, /https?:\/\//, 'nothing is loaded from the network');
    assert.doesNotMatch(html, /<script/, 'and no script');
    const nums = JSON.parse(readFileSync(join(out, 'numbers.json'), 'utf8'));
    assert.ok(nums.every((r) => Number.isFinite(r.lufs100ms) && Number.isFinite(r.peakDbfs) && Array.isArray(r.peaks)));
    // every shipped cue meets every band of both profiles, but the two the cards say cannot (tests/sound/engine-cues.test.mjs): a key's noise sits at 9 kHz, a sub-drop is 2 dB hot in soft-ui
    assert.ok(nums.filter((r) => !r.code && !['key', 'sub-drop'].includes(r.cue)).every((r) => Object.values(r.verdict).every(Boolean)), 'every shipped cue meets every band of both profiles');
    const w = readFileSync(join(out, 'wav', 'ready-glass.wav'));
    assert.equal(w.toString('ascii', 0, 4), 'RIFF');
    assert.equal(w.readUInt16LE(22), 2, 'stereo');
    assert.equal(w.readUInt32LE(24), 48000);
    assert.ok(readdirSync(join(out, 'wav')).length === res.records.length);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a cue picked by name, a profile by name; an unknown profile says so', async () => {
  const out = mkdtempSync(join(tmpdir(), 'mm-listen-'));
  try {
    const res = await buildListen({ out, cues: ['tap'], profiles: ['soft-ui'], code: false });
    assert.equal(res.records.length, 3);
    assert.ok(!existsSync(join(out, 'wav', 'ready-glass.wav')));
    await assert.rejects(() => buildListen({ out, cues: ['tap'], profiles: ['no-such-profile'], code: false }), /sound profile no-such-profile not found/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('wavOf cuts the silence after a sound and keeps both channels', () => {
  const sr = 48000, n = sr, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < 4800; i++) { L[i] = 0.5 * Math.sin(i / 10); R[i] = -L[i]; }
  const w = wavOf([L, R], sr);
  const frames = w.readUInt32LE(40) / 4;
  assert.ok(frames >= 4800 && frames < 4800 + sr * 0.05, `${frames} frames`);
  assert.equal(w.readInt16LE(44 + 4 * 100), -w.readInt16LE(44 + 4 * 100 + 2), 'right is minus left');
});

// Mining from a recording with music under it (`mm sound mine`): each event is measured with its bed taken away
// (the quietest 150 ms of the 0.6 s before it), its family is read only when it stands 12 dB over the bed, and the profile
// fitted to the set gains the third-octave balance of the set (median and spread). The recording is built from numbers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mineSounds } from '../../scripts/sound-mine.mjs';
import { fitProfile } from '../../scripts/lib/sound-mine.mjs';
import { wavOf } from '../../scripts/sound-listen.mjs';
import { validators } from '../../scripts/lib/validate.mjs';
import { SR, render, writeSet } from './_synthetic.mjs';
import { analyseSound } from '../../scripts/lib/sound-mine.mjs';

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'mm-mine-bed-')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; };

/** A recording: a steady bed (a low pad and noise) with the known sounds laid on it at the given seconds and gains (dB). */
function overBed(parts, seconds, bedAmp = 0.002) {
  const n = Math.round(seconds * SR), l2 = new Float32Array(n), r2 = new Float32Array(n);
  for (const [name, at, db = 0] of parts) {
    const [l, r] = render(name), s = Math.round(at * SR), g = 10 ** (db / 20);
    for (let i = 0; i < l.length && s + i < n; i++) { l2[s + i] += l[i] * g; r2[s + i] += r[i] * g; }
  }
  const r = rng(9);
  for (let i = 0; i < l2.length; i++) { const b = bedAmp * (Math.sin((2 * Math.PI * 110 * i) / SR) + 0.7 * r()); l2[i] += b; r2[i] += b; }
  return [l2, r2];
}

test('an event far over the bed keeps its family; an event barely over it is marked not exposed and has none', async () => {
  const dir = join(tmp, 'rec');
  mkdirSync(dir, { recursive: true });
  // the first bar and the mallet stand well over the bed; the string at -34 dB is buried in it
  writeFileSync(join(dir, 'music.wav'), wavOf(overBed([['bar-a', 1.0, 0], ['mallet', 2.5, 0], ['string', 4.0, -24]], 5.5), SR));
  const res = await mineSounds({ input: join(dir, 'music.wav'), out: join(tmp, 'rec-out'), licence: 'CC0-1.0', source: 'built for the test', author: 'the test' });
  const byStart = (t) => res.records.find((r) => Math.abs(r.startS - (t - 0.015)) < 0.05);
  const loud = byStart(1.0), mallet = byStart(2.5), quiet = byStart(4.0);
  assert.ok(loud && mallet, JSON.stringify(res.records.map((r) => [r.id, r.startS])));
  assert.equal(loud.exposed, true);
  assert.ok(loud.exposedDb >= 12, `${loud.exposedDb}`);
  assert.equal(loud.family, 'outcome');
  assert.ok(loud.bed && loud.bed.db < -20, JSON.stringify(loud.bed));
  assert.equal(loud.balance.length, 28);
  assert.ok(loud.masked.length > 0, 'bands the music hides are listed');
  assert.ok(quiet, 'the buried event is still cut out');
  assert.equal(quiet.exposed, false, `${quiet.exposedDb} dB over the bed`);
  assert.equal(quiet.family, null, 'no family is read from an event the bed hides');
});

test('the profile fitted to the set carries the third-octave balance: a median and a spread for each band', async () => {
  const out = join(tmp, 'plain');
  const res = await mineSounds({ input: writeSet(join(tmp, 'plain-set')), out, name: 'plain', licence: 'CC0-1.0' });
  const p = res.profile;
  assert.ok(validators().soundProfile(p), JSON.stringify(validators().soundProfile.errors));
  assert.equal(p.balance.medianDb.length, 28);
  assert.equal(p.balance.spreadDb.length, 28);
  assert.ok(p.balance.spreadDb.every((v) => v >= 0));
  const peak = p.balance.medianDb.reduce((b, v, i, a) => (v > a[b] ? i : b), 0);
  assert.ok(peak >= 12 && peak <= 21, `the set lives around 300 Hz to 2 kHz; its strongest band is ${peak}`);
});

test('fitProfile reads a masked band as missing, not as a deep quiet one', () => {
  const rec = (i, balance, masked) => ({ ...analyseSound(render('bar-a'), SR), source: 's', licence: 'l', exposed: true, balance, masked, id: `r${i}` });
  const full = new Array(28).fill(-60);
  full[17] = -1;
  const records = [rec(1, full.map((v, i) => (i === 3 ? -10 : v)), []), rec(2, full.map((v, i) => (i === 3 ? -12 : v)), []), rec(3, full.map((v, i) => (i === 3 ? -60 : v)), [3])];
  const p = fitProfile(records);
  assert.ok(Math.abs(p.balance.medianDb[3] - -11) < 1.1, `band 3 median ${p.balance.medianDb[3]}: the masked -60 is not counted`);
});

test('an event that is not exposed does not set the profile\'s envelope', () => {
  const a = analyseSound(render('bar-a'), SR);
  const base = { ...a, source: 's', licence: 'l', exposed: true, balance: new Array(28).fill(-60), masked: [] };
  const hidden = { ...base, exposed: false, family: null, attackS: 0.03, t60S: 2, lengthS: 2 };
  const p = fitProfile([base, hidden]), q = fitProfile([base]);
  assert.deepEqual(p.envelope, q.envelope);
});

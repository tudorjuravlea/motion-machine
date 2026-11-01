// `mm beats` and the kick check (SPEC §9): beats are snapped to a 23 ms spectral-flux search within
// ± min(100 ms, 0.3 beat), and a grid whose beats land on kicks (31-125 Hz onsets) under 50 % of the time is
// written `usable: false`, so `mm sound` and W-CUE do not snap cues to it. Tracks are synthesised in the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../../scripts/beats.mjs';
import { fluxSnap, kickCheck, KICK_BAND_HZ, KICK_MIN_SHARE } from '../../scripts/lib/beat-kick.mjs';

const SR = 48000;
const T = 0.5;                       // 120 BPM
const SECONDS = 8;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A track: kicks (a 55 Hz sine falling to 40 Hz, 0.3 s) and 1 kHz clicks on every beat of 0.25 + 0.5k + lag, optionally the kicks off the beat. */
function track({ kicks = true, lag = 0, kickLag = 0, clicks = true, seconds = SECONDS } = {}) {
  const x = new Float32Array(Math.round(seconds * SR)), rnd = mulberry(7);
  for (let k = 0; ; k++) {
    const t0 = 0.25 + k * T + lag;
    if (t0 >= seconds - 0.4) break;
    if (clicks) for (let i = 0; i < 0.12 * SR; i++) { const j = Math.round(t0 * SR) + i; if (j < x.length) x[j] += 0.5 * Math.exp(-i / SR * 60) * Math.sin(2 * Math.PI * 1000 * i / SR); }
    if (kicks) {
      const tk = 0.25 + k * T + kickLag;
      let ph = 0;
      for (let i = 0; i < 0.3 * SR; i++) { const j = Math.round(tk * SR) + i; ph += 2 * Math.PI * (40 + 15 * Math.exp(-i / SR * 25)) / SR; if (j < x.length) x[j] += 0.8 * Math.exp(-i / SR * 14) * Math.sin(ph); }
    }
  }
  for (let i = 0; i < x.length; i++) x[i] += (rnd() - 0.5) * 0.002;
  return x;
}
const grid = (shift = 0, n = 14) => Array.from({ length: n }, (_, k) => 0.25 + k * T + shift);

test('the kick band is 31-125 Hz and a grid needs half its beats on a kick', () => {
  assert.deepEqual(KICK_BAND_HZ, [31, 125]);
  assert.equal(KICK_MIN_SHARE, 0.5);
});

test('a track with kicks on its beats: every beat lands on a kick and the grid is usable', () => {
  const k = kickCheck(track(), grid(), SR);
  assert.ok(k.kicks >= 10, `${k.kicks} kicks found`);
  assert.ok(k.share >= 0.9, `share ${k.share}`);
  assert.equal(k.usable, true);
});

test('a click track without kicks is unusable: no beat lands on a kick', () => {
  const k = kickCheck(track({ kicks: false }), grid(), SR);
  assert.ok(k.share < KICK_MIN_SHARE, `share ${k.share}`);
  assert.equal(k.usable, false);
});

test('a grid that sits half a beat beside the kicks is unusable, and says how far the nearest kick is', () => {
  const k = kickCheck(track({ clicks: false }), grid(0.25), SR);
  assert.ok(k.share < KICK_MIN_SHARE, `share ${k.share}`);
  assert.equal(k.usable, false);
  assert.ok(Math.abs(Math.abs(k.medianOffsetMs) - 250) <= 40 || Math.abs(k.medianOffsetMs) <= 260, `median offset ${k.medianOffsetMs}`);
});

test('a track with no sound has no kick to land on: unusable, not a crash', () => {
  const k = kickCheck(new Float32Array(SR * 2), grid(0, 3), SR);
  assert.equal(k.kicks, 0);
  assert.equal(k.usable, false);
});

test('fluxSnap: a grid 40 ms late of the attacks is pulled onto them within 3 ms; one already on them stays', () => {
  const x = track({ kicks: false });
  const late = fluxSnap(x, grid(0.04), T, SR);
  assert.ok(Math.abs(late.shiftS + 0.04) <= 0.003, `shift ${late.shiftS}`);
  const on = fluxSnap(x, grid(0), T, SR);
  assert.ok(Math.abs(on.shiftS) <= 0.003, `shift ${on.shiftS}`);
  // the search is limited to min(100 ms, 0.3 beat) = 100 ms at 120 BPM: a grid 180 ms off is not chased
  const far = fluxSnap(x, grid(0.18), T, SR);
  assert.ok(Math.abs(far.shiftS) <= 0.1 + 1e-9, `shift ${far.shiftS}`);
});

test('analyse writes the kick check and usable beside the grid: kicks usable, no kicks not', () => {
  const withKicks = analyse(track(), { sampleRate: SR });
  assert.equal(withKicks.usable, true);
  assert.ok(withKicks.kickCheck.share >= 0.9, JSON.stringify(withKicks.kickCheck));
  const bare = analyse(track({ kicks: false }), { sampleRate: SR });
  assert.equal(bare.usable, false);
  assert.ok(bare.kickCheck.share < KICK_MIN_SHARE);
  for (const r of [withKicks, bare]) r.beats.forEach((b, i) => assert.ok(Math.abs(b - (0.25 + 0.5 * i)) <= 0.006, `beat ${i} at ${b}`));
});

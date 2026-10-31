// scripts/lib/audio-measure.mjs measures a sound from its samples: the K-weighted loudness agrees with
// ffmpeg's ebur128 on the same samples, and the envelope, spectrum and stereo measures come back as built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as M from '../../scripts/lib/audio-measure.mjs';

const SR = 48000;
const make = (seconds, f) => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => f(i / SR));
const wav = (channels) => {
  const n = channels[0].length, b = Buffer.alloc(44 + n * channels.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * channels.length * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(channels.length, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * channels.length * 4, 28); b.writeUInt16LE(channels.length * 4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * channels.length * 4, 40);
  for (let i = 0; i < n; i++) channels.forEach((c, k) => b.writeFloatLE(c[i], 44 + (i * channels.length + k) * 4));
  return b;
};

test('K-weighted loudness agrees with ffmpeg ebur128 on a steady stereo sound', () => {
  const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 - 0.5; }; })();
  const L = make(6, (t) => 0.1 * Math.sin(2 * Math.PI * 220 * t) + 0.05 * Math.sin(2 * Math.PI * 1500 * t) + 0.02 * rnd());
  const R = make(6, (t) => 0.08 * Math.sin(2 * Math.PI * 330 * t) + 0.06 * Math.sin(2 * Math.PI * 3100 * t) + 0.02 * rnd());
  const dir = mkdtempSync(join(tmpdir(), 'mm-measure-'));
  try {
    const f = join(dir, 'x.wav');
    writeFileSync(f, wav([L, R]));
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-i', f, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
    const theirs = Number(r.stderr.slice(r.stderr.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+)\s+LUFS/)[1]);
    assert.ok(Math.abs(M.ungatedLufs([L, R], SR) - theirs) < 0.15, `ours ${M.ungatedLufs([L, R], SR).toFixed(2)}, ffmpeg ${theirs}`);
    // a steady sound is as loud in its loudest 100 ms as overall
    assert.ok(Math.abs(M.loudest100ms([L, R], SR) - theirs) < 0.5, `loudest 100 ms ${M.loudest100ms([L, R], SR).toFixed(2)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the loudest 100 ms of a short event is the event, not the silence around it', () => {
  const burst = make(1, (t) => (t > 0.3 && t < 0.4 ? 0.2 * Math.sin(2 * Math.PI * 1000 * t) : 0));
  const loud = M.loudest100ms([burst, burst], SR), all = M.ungatedLufs([burst, burst], SR);
  assert.ok(loud > all + 8, `${loud.toFixed(1)} against ${all.toFixed(1)} over the whole second`);
  assert.ok(Math.abs(M.loudest100ms([burst.map((x) => x * 0.5), burst.map((x) => x * 0.5)], SR) - (loud - 6.02)) < 0.05, 'halving the amplitude lowers it 6.02 dB');
  assert.ok(Number.isFinite(M.loudest100ms([Float32Array.from({ length: 480 }, (_, i) => 0.1 * Math.sin(i))], SR)), 'a sound shorter than 100 ms is padded');
});

test('attack and T60 come back from a built envelope', () => {
  const x = make(1, (t) => (t < 0.01 ? t / 0.01 : 10 ** (-3 * (t - 0.01) / 0.3)) * Math.sin(2 * Math.PI * 800 * t));
  const m = M.measure([x, x], SR);
  assert.ok(Math.abs(m.attackS - 0.008) < 0.0015, `attack ${m.attackS} for a 10 ms linear rise`);
  assert.ok(Math.abs(m.t60S - 0.3) < 0.03, `T60 ${m.t60S} for 0.3`);
  assert.ok(Math.abs(m.peakDbfs - 0) < 0.1);
  const steady = make(1, (t) => 0.3 * Math.sin(2 * Math.PI * 800 * t));
  assert.equal(M.t60S(M.envelope([steady], SR)), null, 'a sound that never falls has no T60');
  assert.equal(M.attackS(M.envelope([new Float32Array(4800)], SR)), null, 'and silence has no attack');
});

test('spectrum: the centroid, the strongest peaks and the flatness of a tone, two tones and noise', () => {
  const tone = make(1, (t) => 0.3 * Math.sin(2 * Math.PI * 1000 * t));
  const sp = M.spectrum([tone], SR);
  assert.ok(Math.abs(M.centroidHz(sp) - 1000) < 15 && Math.abs(M.rolloffHz(sp) - 1000) < 15);
  const two = make(1, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * t) + 0.15 * Math.sin(2 * Math.PI * 1217 * t));
  const peaks = M.peaksOf(M.spectrum([two], SR), { max: 2 });
  assert.deepEqual(peaks.map((p) => Math.round(p.f)), [440, 1217]);
  assert.ok(Math.abs(peaks[1].db - peaks[0].db - -6.02) < 0.7, 'the second is half the first: -6 dB');
  let a = 99;
  const noise = make(1, () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 - 0.5; });
  assert.ok(M.flatness(M.spectrum([noise], SR)) > 0.5 && M.flatness(sp) < 0.01);
});

test('stereo: the lean is left minus right in K-weighted power, the width is side against mid', () => {
  const s = make(1, (t) => 0.2 * Math.sin(2 * Math.PI * 700 * t));
  assert.ok(Math.abs(M.balanceDb([s, s.map((x) => x / 1.2)], SR) - 20 * Math.log10(1.2)) < 0.02, 'left 1.2 times right: +1.58 dB');
  assert.equal(M.balanceDb([s], SR), 0);
  assert.ok(Math.abs(M.balanceDb([s, s], SR)) < 1e-9);
  const c = make(1, (t) => 0.2 * Math.cos(2 * Math.PI * 700 * t));
  const L = s.map((x, i) => x + 0.1 * c[i]), R = s.map((x, i) => x - 0.1 * c[i]);
  assert.ok(Math.abs(M.sideMidDb([L, R]) - 20 * Math.log10(0.1)) < 0.05, `side -20 dB: ${M.sideMidDb([L, R])}`);
  assert.ok(Math.abs(M.balanceDb([L, R], SR)) < 0.01, 'a quadrature side leans neither way');
  assert.equal(M.sideMidDb([s]), -Infinity);
  assert.equal(M.sideMidDb([s, s]), -Infinity);
});

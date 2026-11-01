// Audio sync proof: a click placed at a known time in the mix lands at that time in the MP4 that ships.
// An AAC encoder adds priming samples (about 43 ms: 2048 at 48 kHz); without an edit list that
// tells the player to skip them, the sound plays that much late. The piece is the cue fixture with one
// `click` cue at 1.25 s and no track; it is exported by `mm export`, mixed and muxed by `mm sound`, and
// the MP4's audio is decoded the way a player decodes it. The click's place in the unencoded mix
// (out/mix.wav) is the reference, so what is measured is what the encode and the mux do to time.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportPiece } from '../../scripts/export.mjs';
import { buildSound, probe } from '../../scripts/sound.mjs';
import { verifyFile } from '../../scripts/lib/export-qa.mjs';
import { PATTERNS, ensurePiece, variant } from '../../fixtures/sound/setup.mjs';
import { roleOf } from '../../scripts/lib/sound-roles.mjs';

const SR = 48000;
const CLICK_AT = 1.25;
const ONE_MS = 0.001;
const PLAYED_AT = CLICK_AT + roleOf('click').offsetMs / 1000;       // a click leads its picture by its role's offset (SPEC §9)
let dir, mp4;

/** Mono float samples of the first audio stream of `file`, 48 kHz, as a player decodes it (edit list applied). */
function decode(file, extra = []) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...extra, '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 256 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length - (r.stdout.length % 4)));
}

/** Where the click is, in seconds: the energy-weighted centre of the 20 ms around the loudest sample. */
function clickAt(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[peak])) peak = i;
  const from = Math.max(0, peak - 480), to = Math.min(samples.length, peak + 480);
  let e = 0, m = 0;
  for (let i = from; i < to; i++) { const x = samples[i] * samples[i]; e += x; m += x * i; }
  return m / e / SR;
}

before(async () => {
  await ensurePiece();
  dir = await variant('sync-click', { track: null, beats: null, cues: [null, 'click', null, null] });
  const { manifest, code } = await exportPiece(dir, { fps: 10, formats: ['16x9'], force: true });
  assert.equal(code, 0);
  mp4 = manifest.files[0].file;
  const r = await buildSound(dir, { patterns: PATTERNS });
  assert.deepEqual(r.muxed, [mp4]);
});

test('the detector finds a shift: the same samples 43 ms later are measured 43 ms later', () => {
  const a = decode(join(dir, 'out', 'mix.wav'));
  const late = new Float32Array(a.length + 2064);
  late.set(a, 2064);
  assert.ok(Math.abs(clickAt(late) - clickAt(a) - 2064 / SR) < 0.0002);
});

test('the cue sits at its time in the mix, and the mix in the MP4 sits at the same time to within a millisecond', () => {
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  assert.deepEqual(cues.map((c) => [c.name, c.at]), [['click', CLICK_AT]]);
  const mix = clickAt(decode(join(dir, 'out', 'mix.wav')));
  assert.ok(Math.abs(mix - PLAYED_AT) < 0.002, `the click is at ${mix} s in the mix, its picture event is ${CLICK_AT} s and its role leads by ${roleOf('click').offsetMs} ms`);
  const shipped = clickAt(decode(mp4));
  const off = shipped - mix;
  assert.ok(Math.abs(off) <= ONE_MS, `the click lands ${(off * 1000).toFixed(3)} ms from its place in the mix (an AAC priming offset would be about 43 ms late)`);
});

test('the file carries the edit list that skips the encoder\'s priming: without it the click would be late', () => {
  const primed = clickAt(decode(mp4, ['-ignore_editlist', '1'])) - clickAt(decode(mp4));
  assert.ok(primed > 0.01 && primed < 0.06, `ignoring the edit list moves the click ${(primed * 1000).toFixed(1)} ms`);
});

test('the audio and the picture both start at zero, and the file reads clean to the export check', async () => {
  const info = await probe(mp4);
  const audio = info.streams.find((s) => s.codec_type === 'audio'), video = info.streams.find((s) => s.codec_type === 'video');
  assert.equal(audio.codec_name, 'aac');
  assert.ok(Math.abs(Number(audio.start_time)) <= ONE_MS, `audio starts at ${audio.start_time} s`);
  assert.ok(Math.abs(Number(video.start_time)) <= ONE_MS, `video starts at ${video.start_time} s`);
  const f = await verifyFile(mp4, { dir, phase: 'final', fps: 10 });
  assert.equal(f.checks.find((c) => c.id === 'QA-AUDIO').status, 'PASS', JSON.stringify(f.checks.find((c) => c.id === 'QA-AUDIO')));
});

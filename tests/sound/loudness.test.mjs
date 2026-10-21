// The mixed kit-smoke film measures -14 ± 1 LUFS with true peak ≤ -1 dBTP; a -30 LUFS
// input is normalised; the audio stream is as long as the picture (within one frame); the muxed MP4
// keeps its video untouched; and the clipping negative fails G-PEAK while the quiet one only warns W-LOUDNESS.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PATTERNS, ctxFor, ensureNegatives, ensurePiece, ensurePremix, ensureQuiet, ensureShort, variant, withPicture, ROOT } from '../../fixtures/sound/setup.mjs';
import { buildSound, main, measureLoudness, probe, streamSeconds } from '../../scripts/sound.mjs';
import gPeak from '../../scripts/check/G-PEAK.mjs';
import wLoudness from '../../scripts/check/W-LOUDNESS.mjs';
const PICTURE = 'kit-smoke-cues-16x9.mp4';   // <story id>-<format>.mp4: the name `mm export` gives a render

const FPS = 10;
let negatives;
before(async () => { await ensurePiece(); negatives = await ensureNegatives(); });

const inBand = (m, target = -14) => assert.ok(Math.abs(m.lufs - target) <= 1 && m.truePeak <= -1, `${m.lufs} LUFS, ${m.truePeak} dBTP`);

async function lengths(mp4) {
  const v = await streamSeconds(mp4, 'video'), a = await streamSeconds(mp4, 'audio');
  return { v, a, diff: Math.abs(v - a) };
}

test('the mixed kit-smoke film (track + bed + cues) measures -14 ± 1 LUFS and ≤ -1 dBTP, in the file and in the shipped MP4', async () => {
  const dir = await variant('loud-mix', { cues: ['bed', 'hit', 'tick', 'tick'] });
  const mp4 = await withPicture(dir, PICTURE);
  const before = (await probe(mp4)).streams.find((s) => s.codec_type === 'video');
  const r = await buildSound(dir, { patterns: PATTERNS });
  assert.deepEqual(r.notes, []);
  inBand(r.loudness);
  inBand(await measureLoudness(join(dir, 'out', 'mix.wav')));
  inBand(await measureLoudness(mp4));
  const shipped = await probe(mp4);
  const audio = shipped.streams.find((s) => s.codec_type === 'audio');
  assert.equal(audio.codec_name, 'aac');
  assert.equal(Number(audio.sample_rate), 48000);
  const video = shipped.streams.find((s) => s.codec_type === 'video');
  assert.equal(video.nb_frames, before.nb_frames, 'the picture is copied, not re-encoded');
  assert.equal(video.codec_name, 'h264');
  for (const rule of [gPeak, wLoudness]) {
    const g = await rule(await ctxFor(dir));
    assert.equal(g.status, 'PASS', JSON.stringify(g.evidence));
    assert.deepEqual(g.evidence.files.map((f) => f.file), [`out/${PICTURE}`], 'the shipped MP4 is what was measured');
  }
});

test('the audio stream is as long as the picture, within one frame (track longer, shorter, and cues only)', async () => {
  for (const [name, opts] of [
    ['len-long', { track: await ensurePremix() }],            // 8 s track under a 6 s picture: trimmed
    ['len-short', { track: ensureShort(3) }],                 // 3 s track under a 6 s picture: padded
    ['len-cues', { track: null, beats: null, cues: ['bed', 'hit', 'tick', 'tick'] }],
  ]) {
    const dir = await variant(name, opts);
    const mp4 = await withPicture(dir, PICTURE);
    const r = await buildSound(dir, { patterns: PATTERNS });
    const l = await lengths(mp4);
    assert.ok(l.diff <= 1 / FPS, `${name}: video ${l.v} s, audio ${l.a} s`);
    const wav = await streamSeconds(r.mix, 'audio');
    assert.ok(Math.abs(wav - l.v) <= 1 / FPS, `${name}: mix.wav ${wav} s`);
  }
});

test('a -30 LUFS input is normalised to the target', async () => {
  const quiet = await ensureQuiet();
  const input = await measureLoudness(quiet);
  assert.ok(Math.abs(input.lufs + 30) <= 0.3, `fixture measures ${input.lufs}`);
  const dir = await variant('quiet', { track: quiet, cues: [null, null, null, null] });
  await withPicture(dir, PICTURE);
  const r = await buildSound(dir, { patterns: PATTERNS });
  inBand(r.loudness);
  inBand(await measureLoudness(join(dir, 'out', 'kit-smoke-cues-16x9.mp4')));
});

test('a pre-mixed -8 LUFS track is brought down to the target, and the style target is honoured', async () => {
  const premix = await ensurePremix();
  assert.ok(Math.abs((await measureLoudness(premix)).lufs + 8) <= 0.3);
  const dir = await variant('loud-in', { track: premix, cues: [null, null, null, null] });
  const r = await buildSound(dir, { patterns: PATTERNS });
  inBand(r.loudness);
  const dir2 = await variant('target-16', { track: premix, cues: [null, null, null, null], style: { sound: { loudnessLufs: -16 } } });
  inBand((await buildSound(dir2, { patterns: PATTERNS })).loudness, -16);
});

test('fixtures/negatives/G-PEAK fails G-PEAK; W-LOUDNESS/ only warns; with no audio built both skip with a reason', async () => {
  const g = await gPeak(await ctxFor(negatives.peak));
  assert.equal(g.status, 'FAIL');
  assert.ok(g.evidence.truePeak > -1, JSON.stringify(g.evidence));
  assert.match(g.evidence.reason, /dBTP/);
  const q = await wLoudness(await ctxFor(negatives.quiet));
  assert.equal(q.status, 'WARN');
  assert.ok(Math.abs(q.evidence.measured + 24) <= 0.5, JSON.stringify(q.evidence));
  assert.match(q.evidence.reason, /-24\.\d LUFS/);
  assert.equal((await gPeak(await ctxFor(negatives.quiet))).status, 'PASS', 'a quiet mix does not clip');
  assert.equal((await wLoudness(await ctxFor(negatives.peak))).status, 'WARN', 'the clipping mix is also far from the target');
  const none = await variant('no-audio', { track: null, beats: null, cues: [null, null, null, null] });
  for (const rule of [gPeak, wLoudness]) {
    const s = await rule(await ctxFor(none));
    assert.equal(s.status, 'SKIP');
    assert.ok(s.evidence.reason.length > 10);
  }
  // a silent MP4 (no audio stream) also skips, naming the missing stream
  await withPicture(none, PICTURE);
  for (const rule of [gPeak, wLoudness]) {
    const s2 = await rule(await ctxFor(none));
    assert.equal(s2.status, 'SKIP');
    assert.match(s2.evidence.reason, /no audio stream/);
  }
});

test('a piece with nothing to mix is left alone; a deck is not mixed; setup errors exit 2', async () => {
  const dir = await variant('silent', { track: null, beats: null, cues: [null, null, null, null] });
  const r = await buildSound(dir, { patterns: PATTERNS });
  assert.equal(r.code, 0);
  assert.match(r.notes.join(' '), /nothing to mix/);
  assert.ok(!existsSync(join(dir, 'out', 'mix.wav')));
  const deck = await buildSound(join(ROOT, 'fixtures/kit-smoke/deck'));
  assert.equal(deck.code, 0);
  assert.match(deck.notes.join(' '), /decks are not mixed/);
  assert.equal(await main([join(dir, 'no-such-piece')]), 2);
  assert.equal(await main(['--nope']), 2);
});

test('the CLI runs end to end (exit 0) and rewrites an already-muxed MP4 without stacking audio streams', async () => {
  const dir = await variant('cli', { cues: ['bed', 'hit', 'tick', 'tick'] });
  const mp4 = await withPicture(dir, PICTURE);
  for (let i = 0; i < 2; i++) {
    const p = spawnSync('node', [join(ROOT, 'scripts/sound.mjs'), dir, '--patterns', PATTERNS, '--formats', '16x9'], { encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
  }
  assert.equal((await probe(mp4)).streams.filter((s) => s.codec_type === 'audio').length, 1);
  inBand(await measureLoudness(mp4));
  assert.ok(JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues.length >= 3);
});

test('the shipped sound patterns (patterns/sound/*) go through the same pipeline in every feel, when they exist', { skip: !existsSync(join(ROOT, 'patterns/sound/tick/pattern.js')) && 'patterns/sound/* not built yet' }, async () => {
  for (const palette of ['soft-ui', 'percussive', 'cinematic']) {
    const dir = await variant(`real-${palette}`, { cues: ['bed', 'hit', 'tick', 'success'], style: { sound: { palette } } });
    const mp4 = await withPicture(dir, PICTURE);
    const r = await buildSound(dir, { patterns: join(ROOT, 'patterns') });
    inBand(r.loudness);
    inBand(await measureLoudness(mp4));
    assert.ok((await lengths(mp4)).diff <= 1 / FPS);
    const bed = r.cues.find((c) => c.name === 'bed');
    for (const c of r.cues.filter((x) => x.name !== 'bed')) assert.ok(c.peakDb - bed.peakDb >= 6 && c.peakDb - bed.peakDb <= 8, `${palette} ${c.name}: ${c.peakDb - bed.peakDb} dB over the bed`);
  }
});

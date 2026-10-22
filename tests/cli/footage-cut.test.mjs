// `mm footage cut` on the synthetic fixture (fixtures/footage/make.sh: a test pattern with its frame
// index burned in, speech-like tone with planted pauses): cuts sit only in audio under the quiet
// threshold, the edit is as long as the kept speech plus its leads and tails (±1 frame), the voice
// matches the picture to the sample and reaches the piece's loudness, supplied words land on the
// output clock, and two runs write the same bytes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm, readJson } from './cli-helpers.mjs';

const TMP = join(ROOT, `.tmp-footage-cut-${process.pid}`);
const VIDEO = join(TMP, 'talk.mp4');
const WORDS = join(ROOT, 'fixtures/footage/words.json');
// the planted spans of make.sh: kept speech plus a 100 ms lead and a 250 ms tail around each removed pause
const EXPECTED_S = (2.65 - 0.3) + (7.65 - 3.5) + (11.65 - 9.3);

function piece(name, video = VIDEO) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const r = mm(['media', 'prep', video, '--name', 'talk', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  return dir;
}
function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}
const rmsDb = (s, t) => {
  const c = Math.round(t * 48000);
  let e = 0, n = 0;
  for (let i = Math.max(0, c - 480); i < Math.min(s.length, c + 480); i++) { e += s[i] * s[i]; n++; }
  return 10 * Math.log10(e / n + 1e-12);
};

let plain, again;
before(() => {
  rmSync(TMP, { recursive: true, force: true });
  assert.equal(spawnSync('sh', [join(ROOT, 'fixtures/footage/make.sh'), TMP]).status, 0);
  plain = piece('plain');
  again = piece('again');
  for (const dir of [plain, again]) {
    const r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir]);
    assert.equal(r.status, 0, r.out);
  }
});
after(() => rmSync(TMP, { recursive: true, force: true }));

test('every cut sits in audio under the quiet threshold, and none lands on sound', () => {
  const e = readJson(join(plain, 'assets/talk/edit.json'));
  const src = decode(VIDEO);
  assert.equal(e.cuts.length, 2, JSON.stringify(e.cuts));
  assert.deepEqual(e.onSound, []);
  for (const c of e.cuts) for (const t of [c.out, c.in]) assert.ok(rmsDb(src, t) < e.levels.quietDb, `cut at source ${t}: ${rmsDb(src, t)} dB, quiet under ${e.levels.quietDb}`);
  // and every picture clip starts and ends there: the clip list is the cut list
  e.picture.slice(1).forEach((c, i) => { assert.equal(Math.round((c.from / e.fps) * 1000) / 1000, e.cuts[i].in); });
});

test('the edit is as long as the kept spans, to a frame, and the voice matches it to the sample', () => {
  const e = readJson(join(plain, 'assets/talk/edit.json'));
  assert.equal(e.fps, 30);
  assert.ok(Math.abs(e.frames - EXPECTED_S * 30) <= 1, `${e.frames} frames, expected ${EXPECTED_S * 30} ± 1`);
  assert.equal(e.picture.reduce((n, c) => n + c.length, 0), e.frames);
  const wav = readFileSync(join(plain, 'assets/talk/voice.wav'));
  assert.equal(wav.readUInt32LE(40) / 2, (e.frames * 48000) / 30, 'voice samples = frames × 1600');
});

test('the voice reaches the piece\'s loudness (style sound.loudnessLufs, else -14 LUFS) unless its peak holds it back', () => {
  const e = readJson(join(plain, 'assets/talk/edit.json'));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-f', 'wav', '-i', join(plain, 'assets/talk/voice.wav'), '-af', 'ebur128=peak=sample', '-f', 'null', '-'], { encoding: 'utf8' });
  const lufs = Number(/I:\s+(-?[\d.]+)\s+LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf('Summary:')))[1]);
  assert.equal(e.voice.target, -14);
  if (e.voice.peakLimited) assert.ok(lufs < -14 + 0.5, `${lufs}`);
  else assert.ok(Math.abs(lufs - -14) <= 0.5, `voice at ${lufs} LUFS`);
});

test('two runs write the same edit and the same voice, byte for byte', () => {
  for (const f of ['edit.json', 'voice.wav']) assert.ok(readFileSync(join(plain, 'assets/talk', f)).equals(readFileSync(join(again, 'assets/talk', f))), f);
});

test('supplied words land on the output clock; a word inside a pause keeps that pause', () => {
  const dir = piece('words');
  let r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir, '--words', WORDS]);
  assert.equal(r.status, 0, r.out);
  const e = readJson(join(dir, 'assets/talk/edit.json'));
  const words = readJson(WORDS).words;
  assert.equal(e.words.length, words.length, 'every word is spoken in a kept range');
  assert.ok(Math.abs(e.words[0].at - 0.1) <= 1 / 30 + 0.011, `first word at ${e.words[0].at}`);
  const last = e.words.at(-1);
  assert.ok(last.at < e.duration && last.end <= e.duration + 1e-9);
  // a whispered word inside the 2.0 s pause: that pause stays, 1.65 s longer
  const whisper = join(TMP, 'whisper.json');
  writeFileSync(whisper, JSON.stringify({ words: [...words, { text: 'hm', start: 8.2, end: 8.5 }] }));
  r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir, '--words', whisper]);
  assert.equal(r.status, 0, r.out);
  const w = readJson(join(dir, 'assets/talk/edit.json'));
  assert.equal(w.cuts.length, 1);
  assert.ok(Math.abs(w.frames - (EXPECTED_S + 1.65) * 30) <= 1, `${w.frames}`);
});

test('a WhisperX result is read as words: word_segments, or segments[].words when there are none', () => {
  const dir = piece('whisperx');
  const words = readJson(WORDS).words;
  const plain = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir, '--words', WORDS]);
  assert.equal(plain.status, 0, plain.out);
  const want = readJson(join(dir, 'assets/talk/edit.json')).words;
  const asWx = (w) => ({ word: w.text, start: w.start, end: w.end, score: 0.9 });
  const segFile = join(TMP, 'wx-segments.json'), flatFile = join(TMP, 'wx-flat.json');
  writeFileSync(segFile, JSON.stringify({ segments: [{ start: 0.4, end: 6, text: 'x', words: words.slice(0, 9).map(asWx) }, { start: 6, end: 12, text: 'y', words: words.slice(9).map(asWx) }], language: 'en' }));
  writeFileSync(flatFile, JSON.stringify({ segments: [], word_segments: words.map(asWx), language: 'en' }));
  for (const f of [segFile, flatFile]) {
    const r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir, '--words', f]);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(readJson(join(dir, 'assets/talk/edit.json')).words, want, f);
  }
  const bad = join(TMP, 'wx-bad.json');
  writeFileSync(bad, JSON.stringify({ segments: [{ text: 'no words' }] }));
  const r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir, '--words', bad]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no timed word/);
});

test('usage: the folder must be prepared from the same recording first; a recording with no sound is refused', () => {
  const bare = join(TMP, 'bare');
  mkdirSync(bare, { recursive: true });
  let r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', bare]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /mm media prep/);
  const mute = join(TMP, 'mute.mp4');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x284:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mute]).status, 0);
  r = mm(['footage', 'cut', mute, '--name', 'talk', '--piece', plain]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /prepared from talk\.mp4/);
  assert.equal(mm(['media', 'prep', mute, '--name', 'mute', '--piece', bare]).status, 0);
  r = mm(['footage', 'cut', mute, '--name', 'mute', '--piece', bare]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /no audio stream/);
  r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', plain, '--max-pause', 'soon']);
  assert.equal(r.status, 2, r.out);
});

/** A variant of the fixture recording whose voice sounds where `speech` (an ffmpeg expression in t) is 1. */
function variant(name, speech) {
  const dir = join(TMP, `rec-${name}`);
  assert.equal(spawnSync('sh', [join(ROOT, 'fixtures/footage/make.sh'), dir], { env: { ...process.env, SPEECH: speech } }).status, 0);
  return join(dir, 'talk.mp4');
}

test('a take with no pause is not refused: its edit is one clip with no cut, and a note says so', () => {
  const video = variant('nopause', '1');
  const dir = piece('nopause', video);
  const r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /note: no pause longer than 0\.5 s/);
  const e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.equal(e.cuts.length, 0);
  assert.equal(e.picture.length, 1);
  assert.equal(e.frames, 360, 'the whole take is kept');
  assert.match(e.note, /nothing to cut/);
});

test('a short line in a long quiet take is measured, not refused: the room from the quiet, the voice from the line', () => {
  const video = variant('sparse', 'between(t,5,5.9)');   // 0.9 s of speech in 12 s
  const dir = piece('sparse', video);
  const r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  const e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.ok(e.levels.floorDb < -45 && e.levels.speechDb > -25, JSON.stringify(e.levels));
  assert.equal(e.picture.length, 1);
  assert.ok(Math.abs(e.duration - (0.9 + 0.1 + 0.25)) <= 2 / 30, `kept ${e.duration} s`);
});

test('a take whose room fills its pauses nearly as loud as the voice is refused with the measured gap', () => {
  const dir = join(TMP, 'rec-noisy');
  mkdirSync(dir, { recursive: true });
  const video = join(dir, 'talk.mp4');
  // the fixture's picture and voice, with loud noise over the whole take
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.12:seed=7:sample_rate=48000:duration=12',
    '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', video]).status, 0);
  const p = piece('noisy', video);
  const r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', p]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /speech stands only [\d.]+ dB over the room .*cannot be told from soft speech; cuts need 12 dB/);
});

test('--fillers cuts a sound no transcribed word covers inside a long gap between words; it needs --words', () => {
  // the planted spans, plus an unworded sound (an "um") in the middle of the 2.0 s pause
  const video = variant('filler', '(between(t,0.4,2.4)+between(t,3.6,5.6)+between(t,5.9,7.4)+between(t,8.2,8.6)+between(t,9.4,11.4))');
  const dir = piece('filler', video);
  let r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir, '--words', WORDS]);
  assert.equal(r.status, 0, r.out);
  const kept = readJson(join(dir, 'assets/talk/edit.json'));
  assert.ok(kept.frames > (EXPECTED_S + 0.4) * 30, `without --fillers the sound stays: ${kept.frames} frames`);
  r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir, '--words', WORDS, '--fillers']);
  assert.equal(r.status, 0, r.out);
  const e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.equal(e.cuts.length, 2, JSON.stringify(e.cuts));
  // the same cut of the recording without the sound: the gap goes whole, so the two edits match
  const clean = piece('filler-clean');
  assert.equal(mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', clean, '--words', WORDS, '--fillers']).status, 0);
  const c = readJson(join(clean, 'assets/talk/edit.json'));
  assert.deepEqual(e.picture, c.picture, 'the sound in the gap leaves no trace in the picture');
  assert.ok(e.frames < kept.frames - 0.4 * 30, `${e.frames} frames, against ${kept.frames} without --fillers`);
  assert.equal(e.settings.fillers, true);
  assert.equal(e.words.length, readJson(WORDS).words.length, 'every word survives');
  r = mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir, '--fillers']);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /--fillers needs --words/);
});

test('words are read on the sound\'s clock: when the sound starts after the picture, they move with it', () => {
  // the same recording with its sound muxed 0.2 s late (the picture is unchanged)
  const late = join(TMP, 'late.mp4');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-itsoffset', '0.2', '-i', VIDEO, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-t', '12', late]).status, 0);
  const base = piece('offset-base'), moved = piece('offset-late', late);
  assert.equal(mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', base, '--words', WORDS]).status, 0);
  const r = mm(['footage', 'cut', late, '--name', 'talk', '--piece', moved, '--words', WORDS]);
  assert.equal(r.status, 0, r.out);
  const a = readJson(join(base, 'assets/talk/edit.json')).words, b = readJson(join(moved, 'assets/talk/edit.json')).words;
  assert.equal(a.length, b.length);
  // each word keeps its place against the cut voice (to a frame and the encoder's priming), not 0.2 s early
  a.forEach((w, i) => assert.ok(Math.abs(w.at - b[i].at) <= 1 / 30 + 0.025, `${w.text}: ${w.at} vs ${b[i].at}`));
});

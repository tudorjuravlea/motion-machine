// Deck sound (SPEC §9, §10): a deck's cues are rendered into one sprite with { cue: [startMs, endMs] } and the
// press events that play them; `mm sound <deck>` writes it (out/deck-sound.wav|mp3|m4a and out/deck-sound.json),
// `mm export` embeds it in the standalone deck. The packing is checked on built buffers; the rendering and the
// verb on a real deck.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { buildDeckSprite, deckCueEvents, packSprite, wav16 } from '../../scripts/lib/deck-sound.mjs';
import { mm, readJson, stampChecked } from '../cli/cli-helpers.mjs';

const SR = 48000;
const tone = (hz, seconds, amp = 0.5) => { const n = Math.round(seconds * SR); const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * hz * i / SR) * Math.exp(-i / (0.08 * SR)); return a; };
const entry = (key, hz, seconds, tail = 0.5) => { const body = tone(hz, seconds), padded = new Float32Array(body.length + Math.round(tail * SR)); padded.set(body); return { key, channels: [padded, padded.slice()] }; };
const peak = (a, from, to) => { let p = 0; for (let i = Math.floor(from); i < Math.min(a.length, Math.ceil(to)); i++) p = Math.max(p, Math.abs(a[i])); return p; };

test('packSprite places each cue after the one before with a gap of silence, trims the silent tail and maps each key to [startMs, endMs]', () => {
  const s = packSprite([entry('a', 440, 0.2), entry('b', 880, 0.3)], { gapMs: 100 });
  assert.deepEqual(Object.keys(s.cues), ['a', 'b']);
  const [a0, a1] = s.cues.a, [b0, b1] = s.cues.b;
  assert.ok(a0 >= 0 && a1 > a0 && b0 >= a1 + 100 - 1, `a ${a0}-${a1}, b ${b0}-${b1}`);
  assert.ok(a1 - a0 < 450, 'the 0.5 s of silence after the sound is trimmed away');
  assert.ok(peak(s.channels[0], a0 * SR / 1000, a1 * SR / 1000) > 0.1, 'the sound is where the map says');
  assert.ok(peak(s.channels[0], b0 * SR / 1000, b1 * SR / 1000) > 0.1);
  assert.ok(peak(s.channels[0], a1 * SR / 1000 + 10, b0 * SR / 1000 - 10) < 1e-6, 'silence between');
  assert.equal(s.channels.length, 2);
  assert.equal(s.channels[0].length, s.channels[1].length);
  assert.ok(Math.abs(s.durationMs - b1) < 120);
});

test('packSprite never clips: a hot sprite is scaled to a peak under full scale, a quiet one is left alone', () => {
  const hot = packSprite([entry('h', 440, 0.2)].map((e) => ({ ...e, channels: e.channels.map((c) => c.map((x) => x * 4)) })));
  assert.ok(peak(hot.channels[0], 0, hot.channels[0].length) <= 0.97 + 1e-6);
  const quiet = packSprite([entry('q', 440, 0.2)]);
  assert.ok(Math.abs(peak(quiet.channels[0], 0, quiet.channels[0].length) - 0.5) < 0.02, 'unchanged');
});

test('wav16 writes a 16-bit stereo RIFF at the given rate with the samples interleaved', () => {
  const b = wav16([Float32Array.from([0, 0.5, -0.5]), Float32Array.from([1, -1, 0])], 48000);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 12), 'WAVE');
  assert.equal(b.readUInt16LE(22), 2);
  assert.equal(b.readUInt32LE(24), 48000);
  assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.readUInt32LE(40), 3 * 2 * 2);
  assert.equal(b.readInt16LE(44 + 2 * 2), Math.round(0.5 * 32767));      // frame 1, left
  assert.equal(b.readInt16LE(44 + 2 * 3), -32767);                       // frame 1, right
});

test('deckCueEvents lists a deck schedule\'s cues by press and time within the press, in order', () => {
  const ev = deckCueEvents({ kind: 'deck', events: [
    { kind: 'arrive', press: 1 },
    { kind: 'cue', press: 2, at: 0.3, cue: 'sound/tick', selector: 's2', scene: 'x', params: { gain: 0.5 } },
    { kind: 'cue', press: 1, at: 0, cue: 'tick', selector: 's1', scene: 'w' },
  ] });
  assert.deepEqual(ev.map((e) => [e.press, e.at, e.name]), [[1, 0, 'tick'], [2, 0.3, 'tick']]);
  assert.deepEqual(ev[1].params, { gain: 0.5 });
  assert.deepEqual(deckCueEvents({ kind: 'deck', events: [] }), []);
});

let sprite;
before(async () => { sprite = await buildDeckSprite(join(ROOT, 'pieces', 'golden-deck-editorial')); });

test('a real deck renders into one sprite: every cue event has a key, every key a span with sound in it', () => {
  assert.ok(sprite, 'the golden deck has cues and a palette');
  assert.equal(sprite.mime, 'audio/wav');
  assert.equal(sprite.events.length, 8, 'the golden deck names 8 cues');
  const keys = new Set(sprite.events.map((e) => e.key));
  assert.deepEqual([...keys].sort(), Object.keys(sprite.cues).sort());
  assert.ok(sprite.events.every((e) => Number.isInteger(e.press) && e.press >= 1 && e.at >= 0));
  const wav = sprite.bytes;
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
  const data = wav.subarray(44);
  for (const [key, [a, b]] of Object.entries(sprite.cues)) {
    let p = 0;
    for (let i = Math.floor(a * SR / 1000); i < Math.ceil(b * SR / 1000); i++) p = Math.max(p, Math.abs(data.readInt16LE(i * 4)) / 32768);
    assert.ok(p > 0.01, `${key} has sound in ${a}-${b} ms`);
  }
});

test('a second render gives the same map and events, and samples within one step of 16-bit of the first (Web Audio\'s filters are not bit-exact)', async () => {
  const again = await buildDeckSprite(join(ROOT, 'pieces', 'golden-deck-editorial'));
  assert.deepEqual(again.cues, sprite.cues);
  assert.deepEqual(again.events, sprite.events);
  assert.equal(again.bytes.length, sprite.bytes.length);
  let worst = 0;
  for (let i = 44; i + 1 < sprite.bytes.length; i += 2) worst = Math.max(worst, Math.abs(again.bytes.readInt16LE(i) - sprite.bytes.readInt16LE(i)));
  assert.ok(worst <= 2, `largest difference ${worst}`);
});

test('a deck with no cues has no sprite', async () => {
  assert.equal(await buildDeckSprite(join(ROOT, 'fixtures', 'kit-smoke', 'deck')), null);
});

let dir;
const mp3 = spawnSync('ffmpeg', ['-hide_banner', '-encoders']).stdout.toString().includes('libmp3lame');
before(() => { dir = join(ROOT, 'pieces', `.tmp-deck-sound-${process.pid}`); rmSync(dir, { recursive: true, force: true }); cpSync(join(ROOT, 'pieces', 'golden-deck-editorial'), dir, { recursive: true, filter: (s) => !/[\\/]out$/.test(s) }); });
after(() => rmSync(dir, { recursive: true, force: true }));

test('mm sound <deck> writes out/deck-sound.wav and out/deck-sound.json, and says a deck is not mixed', () => {
  const r = mm(['sound', dir]);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(dir, 'out', 'deck-sound.wav')));
  const meta = readJson(join(dir, 'out', 'deck-sound.json'));
  assert.equal(meta.file, 'deck-sound.wav');
  assert.equal(meta.mime, 'audio/wav');
  assert.deepEqual(meta.cues, sprite.cues);
  assert.deepEqual(meta.events, sprite.events);
  assert.match(r.out, /deck/i);
  assert.equal(readFileSync(join(dir, 'out', 'deck-sound.wav')).length, sprite.bytes.length);
});

test('--sprite mp3 and --sprite aac encode the same sprite with the ffmpeg already needed', (t) => {
  if (!mp3) return t.skip('this ffmpeg has no libmp3lame');
  for (const [codec, ext, mime] of [['mp3', 'mp3', 'audio/mpeg'], ['aac', 'm4a', 'audio/mp4']]) {
    const r = mm(['sound', dir, '--sprite', codec]);
    assert.equal(r.status, 0, r.out);
    const meta = readJson(join(dir, 'out', 'deck-sound.json'));
    assert.equal(meta.file, `deck-sound.${ext}`);
    assert.equal(meta.mime, mime);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, 'out', meta.file)], { encoding: 'utf8' });
    const last = Math.max(...Object.values(meta.cues).map((c) => c[1])) / 1000;
    assert.ok(Number(probe.stdout) >= last - 0.05, `${codec}: ${probe.stdout.trim()} s holds the last cue (${last} s)`);
  }
});

test('--sprite refuses a codec it does not know', () => {
  const r = mm(['sound', dir, '--sprite', 'flac']);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /--sprite/);
});

test('mm export of a deck with cues embeds the sprite in out/deck/index.html and records it in export.json; --sprite refuses an unknown codec', () => {
  stampChecked(dir);
  const bad = mm(['export', dir, '--sprite', 'flac']);
  assert.equal(bad.status, 2, bad.out);
  assert.match(bad.out, /--sprite/);
  const r = mm(['export', dir, '--fps', '5', '--sprite', 'wav']);
  assert.equal(r.status, 0, r.out);
  assert.match(readFileSync(join(dir, 'out', 'deck', 'index.html'), 'utf8'), /data:audio\/wav;base64,/);
  const manifest = readJson(join(dir, 'out', 'export.json'));
  assert.equal(manifest.deck.sound.cues, 4);
  assert.equal(manifest.deck.sound.codec, 'wav');
  assert.deepEqual(manifest.deck.warnings, []);
  assert.match(r.stdout, /sound: 4 cues/);
});

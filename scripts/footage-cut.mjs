#!/usr/bin/env node
// mm footage cut <video> --name <n> [--piece <dir>] [--words <words.json>] [--fillers] [--max-pause 0.5]
// A talking-head recording, prepared first with `mm media prep <video> --name <n>` (its frames), becomes
// an edit beside those frames: <piece>/assets/<n>/edit.json (the picture clips in whole frames, the
// cuts, the measured levels, words on the output clock when a word list is supplied) and voice.wav
// (the cut voice, 48 kHz mono, one static gain toward the piece's loudness). Cuts are placed by
// measurement only (scripts/lib/footage.mjs); there is no transcriber, so words, when wanted, come from
// the user as JSON: [{ text, start, end }] in seconds of the sound (as a transcriber of the file
// counts them, from its first sound sample), { words: [...] }, or the output of an
// on-device WhisperX run (word_segments, or segments[].words). With --fillers (and words) a stretch
// between two words longer than --max-pause is cut too, whatever it holds: a transcriber writes words,
// not hesitations, so a sound there (an "um", a breath) is no word. A take with no pause
// longer than --max-pause is not an error: its edit is one clip, and a note says nothing was cut. On one
// machine the same recording gives the same bytes on every run; another machine's ffmpeg may decode
// compressed sound a few samples differently (its CPU-specific decoder paths), so voice.wav can differ
// there while the cuts in edit.json hold. Exit 0 written, 1 the sound could not be read or its speech
// could not be told apart from the room, 2 usage.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { probe } from './lib/ffmpeg.mjs';
import { DEFAULTS, gainFor, peakDbOf, planEdit, renderVoice, wav16, wordsFrom } from './lib/footage.mjs';
import { TARGET_LUFS } from './check/_loudness.mjs';
import { measureLoudness } from './sound.mjs';

const RATE = 48000;
const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const r3 = (x) => Math.round(x * 1000) / 1000;

const sha1 = (file) => new Promise((ok, no) => {
  const h = createHash('sha1');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no);
});

/** The first audio stream (stream 0 of the audio streams, never a second spatial track) as mono float samples. */
function decodeAudio(file) {
  return new Promise((ok, no) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => no(fail(`ffmpeg is required: ${e.message}`, 2)));
    p.on('close', (code) => {
      if (code !== 0) return no(fail(`ffmpeg could not decode the sound of ${basename(file)}: ${err.trim().split('\n').pop()}`, 1));
      const buf = Buffer.concat(chunks);
      ok(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4))));
    });
  });
}

/** Samples on the picture's clock: audio that starts after the picture is padded, audio before it dropped, the end fitted to the frames. */
function onPictureClock(samples, offsetS, n) {
  const out = new Float32Array(n);
  const shift = Math.round(offsetS * RATE);
  for (let i = Math.max(0, shift); i < n; i++) { const j = i - shift; if (j < samples.length) out[i] = samples[j]; }
  return out;
}

function readWords(file) {
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw fail(`--words: cannot read ${file}: ${e.message}`, 2); }
  try { return wordsFrom(j); } catch (e) { throw fail(`--words: ${e.message}`, 2); }
}

export async function cut({ file, name, piece = '.', words: wordsFile = null, maxPause = DEFAULTS.maxPause, fillers = false }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  if (!(maxPause > 0)) throw fail('--max-pause must be a number of seconds above 0', 2);
  if (!existsSync(file)) throw fail(`no such file: ${file}`, 2);
  if (fillers && !wordsFile) throw fail('--fillers needs --words: the fillers are the sounds between the transcribed words', 2);
  const dir = join(resolve(piece), 'assets', name);
  const metaFile = join(dir, 'media.json');
  const prepFirst = `run \`mm media prep ${basename(file)} --name ${name}\` (no --trim) first`;
  if (!existsSync(metaFile)) throw fail(`assets/${name}/ holds no frame sequence: ${prepFirst}`, 2);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  if (meta.kind !== 'sequence') throw fail(`assets/${name}/ is not a frame sequence: ${prepFirst}`, 2);
  const words = wordsFile ? readWords(wordsFile) : null;
  const hash = await sha1(file);
  if (meta.source?.sha1 !== hash) throw fail(`assets/${name}/ was prepared from ${meta.source?.file ?? 'another file'}, not ${basename(file)}: ${prepFirst}`, 2);
  let info;
  try { info = probe(file); } catch (e) { throw fail(`ffmpeg could not read ${basename(file)}: ${e.message.split('\n').pop()}`, 1); }
  const full = Number(info.format?.duration);
  if (Number.isFinite(full) && Math.abs(meta.frames / meta.fps - full) > 2 / meta.fps + 0.05) throw fail(`assets/${name}/ holds ${meta.duration} s of a ${r3(full)} s recording: ${prepFirst}`, 2);
  const audio = info.streams?.find((s) => s.codec_type === 'audio');
  if (!audio) throw fail(`${basename(file)} has no audio stream: nothing to cut by`, 1);
  const video = info.streams?.find((s) => s.codec_type === 'video');
  const offset = (Number(audio.start_time) || 0) - (Number(video?.start_time) || 0);

  // a transcriber decodes the sound alone, so its seconds count from the sound's first sample: on the
  // picture's clock they start `offset` later
  const spoken = words && offset ? words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })) : words;
  const n = Math.round((meta.frames / meta.fps) * RATE);
  const samples = onPictureClock(await decodeAudio(file), offset, n);
  let plan;
  try { plan = planEdit({ samples, rate: RATE, fps: meta.fps, frames: meta.frames, words: spoken, maxPause, fillers }); } catch (e) { throw fail(`${basename(file)}: ${e.message}`, 1); }

  // one static gain keeps the voice's own dynamics; mm sound limits the final mix
  const voice = renderVoice(samples, plan.picture, meta.fps, { rate: RATE, join: DEFAULTS.join });
  const styleFile = join(resolve(piece), 'style.json');
  const target = (existsSync(styleFile) && JSON.parse(readFileSync(styleFile, 'utf8')).sound?.loudnessLufs) || TARGET_LUFS;
  const tmp = mkdtempSync(join(tmpdir(), 'mm-footage-'));
  let measured;
  try {
    writeFileSync(join(tmp, 'unity.wav'), wav16(voice, RATE));
    measured = await measureLoudness(join(tmp, 'unity.wav'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const g = gainFor({ lufs: measured?.lufs, peakDb: peakDbOf(voice) }, target);
  const k = 10 ** (g.gainDb / 20);
  for (let i = 0; i < voice.length; i++) voice[i] *= k;

  const edit = {
    kind: 'edit', fps: meta.fps, frames: plan.frames, duration: plan.duration,
    source: { file: basename(file), sha1: hash },
    levels: plan.levels,
    settings: { maxPause, lead: DEFAULTS.lead, tail: DEFAULTS.tail, join: DEFAULTS.join, ...(fillers ? { fillers: true } : {}) },
    picture: plan.picture, cuts: plan.cuts, onSound: plan.onSound,
    ...(plan.note ? { note: plan.note } : {}),
    voice: { file: 'voice.wav', target, lufs: Number.isFinite(measured?.lufs) ? r3(measured.lufs) : null, gainDb: g.gainDb, peakLimited: g.peakLimited },
    ...(plan.words ? { words: plan.words } : {}),
  };
  writeFileSync(join(dir, 'voice.wav'), wav16(voice, RATE));
  writeFileSync(join(dir, 'edit.json'), `${JSON.stringify(edit, null, 2)}\n`);
  return { dir, edit, of: r3(meta.frames / meta.fps) };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      name: { type: 'string' }, piece: { type: 'string' }, words: { type: 'string' }, fillers: { type: 'boolean' }, 'max-pause': { type: 'string' } } });
    if (p.length !== 1 || !v.name) throw fail(usageText('footage cut'), 2);
    const maxPause = v['max-pause'] == null ? DEFAULTS.maxPause : Number(v['max-pause']);
    const { dir, edit, of } = await cut({ file: p[0], name: v.name, piece: v.piece, words: v.words ?? null, maxPause, fillers: !!v.fillers });
    console.log(`kept ${edit.picture.length} clips, ${edit.duration} s of ${of} s (${edit.cuts.length} pauses cut); voice ${edit.voice.gainDb >= 0 ? '+' : ''}${edit.voice.gainDb} dB toward ${edit.voice.target} LUFS${edit.voice.peakLimited ? ', held back by its peak' : ''}${edit.words ? `; ${edit.words.length} words on the edit's clock` : ''}`);
    if (edit.note) console.log(`note: ${edit.note}`);
    for (const s of edit.onSound) console.log(`listen: the cut at ${s.at} s leaves its quiet on the ${s.side} side (source ${s.source} s)`);
    console.log(`wrote edit.json and voice.wav to ${dir}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage cut')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });

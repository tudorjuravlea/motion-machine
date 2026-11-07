// Deck sound (SPEC §9, §10). A deck has no picture clock to mix against, so its cues travel as a sprite: every
// distinct cue the story names, rendered once through an OfflineAudioContext as `mm sound` renders a film's, packed
// one after another with a gap of silence into one WAV (or an MP3 or AAC made from it by the ffmpeg already needed),
// with { key: [startMs, endMs] } for each and the press events that play them ({ press, at, key }: `at` seconds into
// the press). The standalone deck embeds it as a base64 data URI and plays it from its own player
// (scripts/lib/deck-player.js), after the first gesture; a press plays the cues of its press, a jump plays nothing.
// The idea of a sprite grammar and of a data URI decoded without a network request is howler.js's (NOTICE).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { ROOT, openPiece } from './browser.mjs';
import { UsageError } from './cli.mjs';
import { cueName } from './cues.mjs';
import { monoAsDual } from './sound-mix.mjs';
import { cueAnchors, offsetFor, placeCue } from './sound-place.mjs';
import { loadProfile } from './sound-profile.mjs';
import { sampleMap, sampleProblems } from './sound-sample.mjs';
import { paramsOf } from '../../runtime/kit/params.js';

const SR = 48000;

export const GAP_MS = 120;
export const TAIL_FLOOR_DB = -70;      // the silence after a sound: whatever falls this far under its own peak
const CEILING = 0.97;
export const CODECS = { wav: { ext: 'wav', mime: 'audio/wav' }, mp3: { ext: 'mp3', mime: 'audio/mpeg' }, aac: { ext: 'm4a', mime: 'audio/mp4' } };

/** The cue events of a deck schedule, in the order they sound: [{ press, at, name, params?, selector, scene }]. */
export function deckCueEvents(sched) {
  return (sched?.events ?? []).filter((e) => e.kind === 'cue' && Number.isInteger(e.press))
    .map((e) => ({ press: e.press, at: e.at ?? 0, name: cueName(e.cue), selector: e.selector, scene: e.scene, ...(e.params ? { params: e.params } : {}) }))
    .sort((a, b) => a.press - b.press || a.at - b.at);
}

/**
 * Packs rendered cues into one buffer: [{ key, channels: [L, R] }] in order, each trimmed of the silence after it, a `gapMs` of silence
 * between. Returns { channels, cues: { key: [startMs, endMs] }, durationMs }; the whole is scaled down, never up, to a peak of 0.97.
 */
export function packSprite(entries, { sampleRate = SR, gapMs = GAP_MS } = {}) {
  const gap = Math.round(gapMs * sampleRate / 1000);
  const trimmed = entries.map((e) => {
    const n = e.channels[0].length;
    let top = 0;
    for (const c of e.channels) for (let i = 0; i < n; i++) top = Math.max(top, Math.abs(c[i]));
    const floor = top * 10 ** (TAIL_FLOOR_DB / 20);
    let end = n;
    while (end > 1 && e.channels.every((c) => Math.abs(c[end - 1]) <= floor)) end--;
    return { key: e.key, channels: e.channels.map((c) => c.subarray(0, end)), length: end };
  });
  const total = trimmed.reduce((n, e) => n + e.length + gap, 0) || 1;
  const out = [new Float32Array(total), new Float32Array(total)], cues = {};
  let at = 0;
  for (const e of trimmed) {
    out.forEach((dst, ch) => dst.set(e.channels[Math.min(ch, e.channels.length - 1)], at));
    cues[e.key] = [Math.round(at * 1000 / sampleRate), Math.round((at + e.length) * 1000 / sampleRate)];
    at += e.length + gap;
  }
  let peak = 0;
  for (const c of out) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (peak > CEILING) for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= CEILING / peak;
  return { channels: out, cues, durationMs: Math.round(total * 1000 / sampleRate) };
}

/** 16-bit PCM WAV of 1 or 2 channels of floats. */
export function wav16(channels, sampleRate = SR) {
  const n = channels[0].length, ch = channels.length;
  const b = Buffer.alloc(44 + n * ch * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * ch + c) * 2);
  return b;
}

/** The WAV bytes as `codec` (wav is passed through; mp3 and aac are made by ffmpeg): { bytes, mime, ext }. */
export async function encodeSprite(wav, codec = 'wav', kit = null) {
  const c = CODECS[codec];
  if (!c) throw new UsageError(`--sprite takes wav, mp3 or aac, not ${codec}`);
  if (codec === 'wav') return { bytes: wav, ...c };
  const tmp = mkdtempSync(join(tmpdir(), 'mm-sprite-'));
  try {
    writeFileSync(join(tmp, 'in.wav'), wav);
    const args = codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
    kit ??= await import('../sound.mjs');
    await kit.ffmpeg(['-i', join(tmp, 'in.wav'), '-vn', ...args, join(tmp, `out.${c.ext}`)]);
    return { bytes: readFileSync(join(tmp, `out.${c.ext}`)), ...c };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Renders a deck's cues into a sprite: { bytes, mime, ext, cues, events, durationMs, notes } or null when the deck names no cue or its style
 * has no sound palette. `piece` is an opened piece (scripts/lib/browser.mjs openPiece) to reuse, else one is opened and closed. A cue meets
 * its picture event as `mm sound` places it in a film (its role's anchor and offset), and starts no earlier than its press does.
 */
export async function buildDeckSprite(pieceDir, { codec = 'wav', patterns = null, piece = null, kit = null } = {}) {
  kit ??= await import('../sound.mjs');   // `mm sound` hands its own functions in: it cannot import itself while it runs
  const { VARY_SEEDS, loadCueModules, renderInPage, resolvePatternsBase } = kit;
  const dir = resolve(pieceDir);
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  if (story.kind !== 'deck') throw new UsageError('a sprite is for a deck');
  const palette = style.sound?.palette ?? 'none';
  if (palette === 'none' || !story.scenes.some((sc) => sc.beats.some((b) => b.cue))) return null;
  const notes = [];
  const own = !piece;
  piece ??= await openPiece(dir, { format: story.formats[0] });
  try {
    const sched = await piece.page.evaluate(() => JSON.parse(JSON.stringify({ kind: window.mm.schedule.kind, events: window.mm.schedule.events.filter((e) => e.kind === 'cue') })));
    const cues = deckCueEvents(sched);
    if (!cues.length) return null;
    const patternsBase = resolvePatternsBase(dir, patterns);
    const rel = relative(ROOT, patternsBase).split(sep).join('/');
    if (rel.startsWith('..')) throw new UsageError(`patterns base must live under the repo root: ${patternsBase}`);
    const profile = style.sound?.profile ? loadProfile(style.sound.profile, dir) : null;
    const samples = sampleMap(story, style, dir);
    const mods = await loadCueModules(cues.map((c) => c.name), patternsBase, profile, { strict: true, samples });
    for (const n of Object.keys(samples)) if (mods[n]) for (const p of sampleProblems(samples[n])) notes.push(`sample ${samples[n].rel} (cue ${n}): ${p}`);
    const missing = [...new Set(cues.map((c) => c.name))].filter((n) => !mods[n]);
    if (missing.length) throw new Error(`sound pattern(s) not found under ${join(patternsBase, 'sound')}: ${missing.join(', ')}`);

    // one render per distinct cue and params, a recipe that varies (taps) rung through four seeds in turn, as a film's are
    const seen = new Map();
    for (const c of cues) {
      const mod = mods[c.name];
      const { offsetMs, soundOk, big, ...opts } = paramsOf(mod, c.params, style);
      c.extra = { offsetMs, soundOk, big };
      const n = seen.get(c.name) ?? 0;
      seen.set(c.name, n + 1);
      if (mod.recipe?.vary) opts.seed = (Number(opts.seed) + (n % VARY_SEEDS) * 101) >>> 0;
      c.opts = opts;
      c.key = `${c.name}|${JSON.stringify(opts)}`;
    }
    const variants = [...new Map(cues.map((c) => [c.key, c])).values()];
    const buffers = await renderInPage(piece.page, piece.server.url, rel, variants.filter((c) => !mods[c.name].sample).map((c) => ({ key: c.key, name: c.name, feel: palette, opts: c.opts, ...(mods[c.name].recipe ? { recipe: mods[c.name].recipe, profile } : {}) })));
    for (const c of variants.filter((x) => mods[x.name].sample)) {
      const g = Number(c.opts.gain ?? 1);
      buffers[c.key] = { durationS: mods[c.name].durationS, channels: mods[c.name].channels.map((ch) => ch.map((x) => x * g)) };
    }
    const entries = variants.map((c) => ({ key: c.key, channels: monoAsDual(buffers[c.key].channels) }));
    const packed = packSprite(entries);
    const anchors = Object.fromEntries(entries.map((e) => [e.key, cueAnchors(e.channels, SR)]));
    const events = cues.map((c) => {
      const a = anchors[c.key];
      const start = a ? placeCue({ pictureS: c.at, anchors: a, offset: offsetFor(c.name, c.extra, style) }).startS : c.at;
      return { press: c.press, at: Math.round(Math.max(0, start) * 1000) / 1000, key: c.key };
    }).sort((a, b) => a.press - b.press || a.at - b.at);
    const encoded = await encodeSprite(wav16(packed.channels, SR), codec, kit);
    return { ...encoded, cues: packed.cues, events, durationMs: packed.durationMs, notes };
  } finally { if (own) await piece.close(); }
}

/** Writes out/deck-sound.<ext> and out/deck-sound.json for a deck; removes an earlier sprite when there is none now. Returns { sprite, files }. */
export async function writeDeckSound(pieceDir, { codec = 'wav', patterns = null, kit = null } = {}) {
  const out = join(resolve(pieceDir), 'out');
  const sprite = await buildDeckSprite(pieceDir, { codec, patterns, kit });
  if (existsSync(out)) for (const f of readdirSync(out)) if (/^deck-sound\.(wav|mp3|m4a|json)$/.test(f)) rmSync(join(out, f));
  if (!sprite) return { sprite: null, files: [] };
  mkdirSync(out, { recursive: true });
  const file = `deck-sound.${sprite.ext}`;
  writeFileSync(join(out, file), sprite.bytes);
  writeFileSync(join(out, 'deck-sound.json'), `${JSON.stringify({ file, mime: sprite.mime, bytes: sprite.bytes.length, codec, durationMs: sprite.durationMs, cues: sprite.cues, events: sprite.events }, null, 2)}\n`);
  return { sprite, files: [file, 'deck-sound.json'] };
}

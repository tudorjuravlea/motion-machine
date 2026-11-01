#!/usr/bin/env node
// mm media prep <file> --name <n> [--piece <dir>] [--fps 30] [--fit phone|laptop|<W>x<H>] [--trim <a>-<b>] [--quality 90]
// A screen recording becomes a frame sequence the kit can seek
// frame-exactly: <piece>/assets/<n>/f00001.jpg … and media.json. ffmpeg decodes any container or
// codec it reads, applies the display rotation, resamples to a constant rate and fits the frames
// inside the box the piece will show them in, never upscaling; without --fit the long side is
// capped at 1600 px (SPEC §8). Exit 0 written, 1 ffmpeg failed, 2 usage (a trim that starts past
// the clip's end is a usage error, found before the old asset is touched).
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { probe, runFfmpeg } from './lib/ffmpeg.mjs';
import { scanDuration } from './lib/webm.mjs';
import { cutTrack } from './lib/track.mjs';
import { readTrack } from '../runtime/kit/cursor.js';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
/** The largest screen each device shows a recording in (phone `large` in 9x16; a laptop screen). */
export const FIT = { phone: [660, 1430], laptop: [1600, 1000] };
/** Without --fit: the long side at most 1600 px, either way round. */
const CAP = [1600, 1600];

const sha1 = (file) => new Promise((ok, no) => {
  const h = createHash('sha1');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no);
});

function fitBox(fit) {
  if (fit == null) return null;
  if (FIT[fit]) return FIT[fit];
  const m = /^(\d+)x(\d+)$/.exec(fit);
  if (!m) throw fail(`--fit must be phone, laptop or <W>x<H>, not ${fit}`, 2);
  return [Number(m[1]), Number(m[2])];
}

export async function prep({ file, name, piece = '.', fps = 30, fit, trim, quality = 90 }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  if (!existsSync(file)) throw fail(`no such file: ${file}`, 2);
  if (!(fps > 0 && fps <= 60)) throw fail('--fps must be between 1 and 60', 2);
  if (!(quality >= 1 && quality <= 100)) throw fail('--quality must be between 1 and 100', 2);
  let a = null, b = null;
  if (trim != null) {
    const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(trim);
    if (!m || Number(m[2]) <= Number(m[1])) throw fail('--trim must be <start>-<end> in seconds, end after start', 2);
    [a, b] = [Number(m[1]), Number(m[2])];
  }
  const box = fitBox(fit);
  let source;
  try { source = probe(file); } catch (e) { throw fail(`ffmpeg could not read ${basename(file)}: ${e.message.split('\n').pop()}`, 1); }
  if (!source.streams?.some((s) => s.codec_type === 'video')) throw fail(`ffmpeg could not read ${basename(file)}: no video stream`, 1);
  let full = Number(source.format?.duration);
  // a WebM written while it streamed (a recorder's) carries no duration or a wrong one: its packets say how long it is
  if (/\.webm$/i.test(file)) { try { full = scanDuration(file).seconds; } catch { /* the probe above found a video stream; the container's number stands */ } }
  if (a != null && Number.isFinite(full) && a >= full) throw fail(`--trim starts at ${a} s, past the end of ${basename(file)} (${Math.round(full * 1000) / 1000} s)`, 2);

  const dir = join(resolve(piece), 'assets', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const [bw, bh] = box ?? CAP;
  const scale = `scale=w='min(${bw},iw)':h='min(${bh},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const q = Math.min(31, Math.max(2, Math.round(31 - quality * 0.29)));
  try {
    await runFfmpeg([...(a != null ? ['-ss', String(a), '-to', String(b)] : []), '-i', file,
      '-vf', `fps=${fps},${scale},format=yuvj420p`, '-an', '-c:v', 'mjpeg', '-q:v', String(q), '-start_number', '1', join(dir, 'f%05d.jpg')]);
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw fail(`ffmpeg could not read ${basename(file)}: ${String(e.message).trim().split('\n').slice(-2).join(' ')}`, 1); }
  const frames = readdirSync(dir).filter((f) => /^f\d{5}\.jpg$/.test(f)).length;
  if (!frames) throw fail(`ffmpeg wrote no frames for ${basename(file)}`, 1);
  const first = probe(join(dir, 'f00001.jpg')).streams[0];
  const meta = { kind: 'sequence', fps, frames, w: first.width, h: first.height, duration: Math.round((frames / fps) * 1000) / 1000,
    source: { file: basename(file), sha1: await sha1(file) }, prepared: new Date().toISOString() };
  // a pointer track recorded beside the video (<name>.cursor.json, OpenScreen's sidecar shape) travels with the frames, cut as the video was
  const side = `${file.replace(/\.[^./\\]+$/, '')}.cursor.json`;
  if (existsSync(side)) {
    let raw = null;
    try { raw = JSON.parse(readFileSync(side, 'utf8')); } catch { /* not JSON: no track */ }
    const cut = raw && a != null ? cutTrack(raw, a, b) : raw;
    if (readTrack(cut)) { writeFileSync(join(dir, 'cursor.json'), `${JSON.stringify(cut)}\n`); meta.cursor = 'cursor.json'; }
  }
  writeFileSync(join(dir, 'media.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return { dir, meta };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      name: { type: 'string' }, piece: { type: 'string' }, fps: { type: 'string' }, fit: { type: 'string' }, trim: { type: 'string' }, quality: { type: 'string' } } });
    if (p.length !== 1 || !v.name) throw fail(usageText('media prep'), 2);
    const { dir, meta } = await prep({ file: p[0], name: v.name, piece: v.piece, fps: v.fps ? Number(v.fps) : 30, fit: v.fit, trim: v.trim, quality: v.quality ? Number(v.quality) : 90 });
    console.log(`wrote ${meta.frames} frames (${meta.w}x${meta.h} at ${meta.fps} fps) and media.json${meta.cursor ? ', with the pointer track cursor.json,' : ''} to ${dir}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('media prep')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });

#!/usr/bin/env node
// mm footage scenes <video> [--out <dir>] [--spike 1.8] [--min-scene 0.5]
// The scene cuts of a recording, from the picture alone: a small copy of every frame (at most 30 a
// second) is taken to hue, saturation and value, and a cut is a frame whose colour difference from the one
// before stands at least --spike times above its neighbours' (so a handheld shake, where every frame
// differs a little, is no cut) with no scene shorter than --min-scene seconds. Writes <out>/scenes.json
// (default the current folder): the cuts (second, frame, strength, ratio), the scenes between them, and the
// offset of the sound from the picture, which `mm footage review --scenes` and `mm footage cut --scenes`
// read to keep a cut from leaving a sliver of the other shot. A gradual dissolve has no spike and is not found.
// Exit 0 written, 1 the picture could not be read, 2 usage.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MissingToolError, isArgsError, usageText } from './lib/cli.mjs';
import { bin } from './lib/ffmpeg.mjs';
import { MIN_SCENE_S, SCAN_H, SCAN_W, SPIKE_RATIO, colourDifference, hsvOf, sceneCuts, scenesOf } from './lib/footage-scenes.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const r3 = (x) => Math.round(x * 1000) / 1000;
const MAX_FPS = 30;

/** { fps, duration, offset } of a video file: the picture's rate (capped at MAX_FPS), its length, and the sound's start minus the picture's. */
function streamsOf(file) {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,avg_frame_rate,start_time,duration:format=duration', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error) throw r.error.code === 'ENOENT' ? new MissingToolError('ffprobe') : r.error;
  if (r.status !== 0) throw fail(`ffmpeg could not read ${basename(file)}: ${r.stderr.trim().split('\n').pop()}`, 1);
  const info = JSON.parse(r.stdout);
  const video = info.streams?.find((s) => s.codec_type === 'video'), audio = info.streams?.find((s) => s.codec_type === 'audio');
  if (!video) throw fail(`${basename(file)} has no picture: nothing to find scenes in`, 1);
  const [n, d] = String(video.avg_frame_rate).split('/').map(Number);
  const native = d ? n / d : n;
  if (!(native > 0)) throw fail(`${basename(file)}: the picture has no frame rate`, 1);
  const duration = Number(video.duration) || Number(info.format?.duration);
  return { fps: Math.min(MAX_FPS, native), duration, offset: audio ? r3((Number(audio.start_time) || 0) - (Number(video.start_time) || 0)) : 0 };
}

/** The colour differences of a video's consecutive frames (diffs[i] between frame i - 1 and i), streamed: only the last frame is kept. */
export function scanDifferences(file, fps) {
  return new Promise((ok, no) => {
    const size = SCAN_W * SCAN_H * 3;
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-vf', `fps=${fps},scale=${SCAN_W}:${SCAN_H}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const diffs = [];
    let held = Buffer.alloc(0), prev = null, err = '';
    p.stdout.on('data', (c) => {
      held = held.length ? Buffer.concat([held, c]) : c;
      let at = 0;
      for (; held.length - at >= size; at += size) {
        const cur = hsvOf(held.subarray(at, at + size));
        diffs.push(prev ? colourDifference(prev, cur) : 0);
        prev = cur;
      }
      held = held.subarray(at);
    });
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => no(fail(`ffmpeg is required: ${e.message}`, 2)));
    p.on('close', (code) => (code === 0 ? ok(Float64Array.from(diffs)) : no(fail(`ffmpeg could not decode the picture of ${basename(file)}: ${err.trim().split('\n').pop()}`, 1))));
  });
}

export async function scenes({ file, out = '.', spike = SPIKE_RATIO, minScene = MIN_SCENE_S }) {
  if (!existsSync(file)) throw fail(`no such file: ${file}`, 2);
  if (!(spike > 1)) throw fail('--spike must be a number above 1 (how many times its neighbours a cut stands)', 2);
  if (!(minScene > 0)) throw fail('--min-scene must be a number of seconds above 0', 2);
  const { fps, duration: probed, offset } = streamsOf(file);
  const diffs = await scanDifferences(file, fps);
  const duration = r3(Number.isFinite(probed) ? probed : diffs.length / fps);
  const cuts = sceneCuts(diffs, fps, { spike, minSceneS: minScene });
  const doc = { kind: 'scenes', source: { file: basename(file) }, fps: r3(fps), duration, offset, params: { spike, minScene }, cuts, scenes: scenesOf(cuts, duration) };
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const written = join(dir, 'scenes.json');
  writeFileSync(written, `${JSON.stringify(doc, null, 2)}\n`);
  return { file: written, doc };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      out: { type: 'string' }, spike: { type: 'string' }, 'min-scene': { type: 'string' } } });
    if (p.length !== 1) throw fail(usageText('footage scenes'), 2);
    const { file, doc } = await scenes({ file: p[0], out: v.out ?? '.', spike: v.spike == null ? SPIKE_RATIO : Number(v.spike), minScene: v['min-scene'] == null ? MIN_SCENE_S : Number(v['min-scene']) });
    console.log(`${doc.cuts.length} scene cuts in ${doc.duration} s (${doc.scenes.length} scenes)${doc.cuts.length ? `: ${doc.cuts.map((c) => `${c.at} s`).join(', ')}` : ''}`);
    console.log(`wrote ${file}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage scenes')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });

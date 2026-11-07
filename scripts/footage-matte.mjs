#!/usr/bin/env node
// mm footage matte --name <n> [--piece <dir>] [--masks <dir>] [--quality accurate|balanced] [--feather 3]
// A footage asset already prepared by `mm media prep <video> --name <n>` gets a person matte: one grey
// mask per frame in <piece>/assets/<n>/matte/ (f00001.png …, the frame size, white = person), recorded
// in media.json as `matte`. A layout picture that carries data-footage-matte then shows only the person.
// Where the masks come from:
//   - by default, the macOS Vision framework on this machine (person segmentation, no network, no model
//     download): scripts/lib/segment.swift, compiled with swiftc into <piece>/out/ the first time and
//     kept there under a name that carries the source's hash, so an edited helper is built again;
//   - with --masks <dir>, any tool's masks, one per frame, named as the frames (f00001.png or .jpg …).
// On a machine without the Vision engine (not macOS, or no swiftc) and no --masks, it stops and says so.
// Every mask then goes through scripts/lib/footage-matte.mjs: a 3-frame temporal median and a feather
// of --feather px, so the edge neither flickers nor looks cut with scissors. It also writes face.json,
// the head's box in every frame (scripts/lib/footage-face.mjs), which the kit's face-safe zone reads. The same input on the same
// machine writes the same bytes. Exit 0 written, 1 a tool failed on the frames, 2 usage or setup.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { grayPng, matteSmoother } from './lib/footage-matte.mjs';
import { headBox } from './lib/footage-face.mjs';
import { bin } from './lib/ffmpeg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPER = join(HERE, 'lib', 'segment.swift');
const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const frameName = (i) => `f${String(i + 1).padStart(5, '0')}`;
const NO_ENGINE = 'the default matte engine is the macOS Vision framework (macOS 12 or later with the command-line tools: xcode-select --install), which this machine does not have; supply masks from any tool with --masks <dir>: one grey mask per frame, white = person, named as the frames (f00001.png …)';

/** The extension the supplied masks use (.png, .jpg or .jpeg, all alike), or a usage error naming the first frame without one. */
function maskExt(masks, frames) {
  if (!existsSync(masks)) throw fail(`--masks: no such folder: ${masks}`, 2);
  const ext = ['png', 'jpg', 'jpeg'].find((e) => existsSync(join(masks, `${frameName(0)}.${e}`)));
  if (!ext) throw fail(`--masks: ${masks} has no ${frameName(0)}.png (one grey mask per frame, named as the frames)`, 2);
  for (let i = 1; i < frames; i++) if (!existsSync(join(masks, `${frameName(i)}.${ext}`))) throw fail(`--masks: ${masks} has no mask for frame ${i + 1} (${frameName(i)}.${ext}); it needs one per frame, ${frameName(0)} to ${frameName(frames - 1)}`, 2);
  return ext;
}

/** The compiled Vision helper in <piece>/out/, built on first use; a usage error when this machine cannot build it. */
function helper(piece) {
  if (process.platform !== 'darwin' || spawnSync('swiftc', ['--version']).status !== 0) throw fail(NO_ENGINE, 2);
  const tag = createHash('sha1').update(readFileSync(HELPER)).digest('hex').slice(0, 10);
  const out = join(piece, 'out'), bin = join(out, `segment-${tag}`);
  if (existsSync(bin)) return bin;
  mkdirSync(out, { recursive: true });
  const r = spawnSync('swiftc', ['-O', HELPER, '-o', `${bin}.tmp`], { encoding: 'utf8' });
  if (r.status !== 0) throw fail(`swiftc could not build the Vision helper (macOS 12 or later is needed): ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}; or supply masks with --masks <dir>`, 2);
  renameSync(`${bin}.tmp`, bin);
  return bin;
}

function run(cmd, args) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => no(fail(`${cmd}: ${e.message}`, 2)));
    p.on('close', (code) => (code === 0 ? ok() : no(fail(`${cmd.split('/').pop()} failed: ${err.trim().split('\n').slice(-2).join(' ')}`, 1))));
  });
}

/** Decodes the masks in frame order at w x h grey (ffmpeg) and writes each smoothed one as PNG into dest. */
function smoothInto(src, ext, frames, { w, h, fps }, feather, dest, boxes) {
  return new Promise((ok, no) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-nostdin', '-framerate', String(fps), '-start_number', '1', '-i', join(src, `f%05d.${ext}`), '-frames:v', String(frames),
      '-vf', `scale=${w}:${h}:flags=bilinear,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const size = w * h;
    let pending = Buffer.alloc(0), written = 0, err = '';
    const s = matteSmoother(w, h, feather, (i, mask) => { writeFileSync(join(dest, `${frameName(i)}.png`), grayPng(mask, w, h)); boxes[i] = headBox(mask, w, h); written++; });
    p.stdout.on('data', (c) => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) { s.push(new Uint8Array(pending.subarray(0, size))); pending = pending.subarray(size); }
    });
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => no(fail(`ffmpeg is required: ${e.message}`, 2)));
    p.on('close', (code) => {
      if (code !== 0) return no(fail(`ffmpeg could not read the masks: ${err.trim().split('\n').pop()}`, 1));
      s.end();
      if (written !== frames) return no(fail(`ffmpeg read ${written} masks, not ${frames}`, 1));
      ok();
    });
  });
}

export async function matte({ name, piece = '.', masks = null, quality = 'accurate', feather = 3 }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? '')) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  if (!['accurate', 'balanced'].includes(quality)) throw fail('--quality must be accurate or balanced', 2);
  if (!(Number.isInteger(feather) && feather >= 0 && feather <= 32)) throw fail('--feather must be a whole number of px from 0 to 32', 2);
  const root = resolve(piece), dir = join(root, 'assets', name), metaFile = join(dir, 'media.json');
  const prepFirst = `run \`mm media prep <video> --name ${name}\` first`;
  if (!existsSync(metaFile)) throw fail(`assets/${name}/ holds no frame sequence: ${prepFirst}`, 2);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  if (meta.kind !== 'sequence') throw fail(`assets/${name}/ is not a frame sequence: ${prepFirst}`, 2);

  let src, ext, raw = null;
  if (masks) { src = resolve(masks); ext = maskExt(src, meta.frames); }
  else {
    const bin = helper(root);
    raw = join(root, 'out', `matte-raw-${name}`);
    rmSync(raw, { recursive: true, force: true });
    await run(bin, [dir, raw, quality]);
    src = raw; ext = 'png';
    maskExt(src, meta.frames);
  }
  const tmp = join(dir, 'matte.tmp'), dest = join(dir, 'matte');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const boxes = new Array(meta.frames).fill(null);
  try { await smoothInto(src, ext, meta.frames, meta, feather, tmp, boxes); } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
  writeFileSync(join(dir, 'face.json'), `${JSON.stringify({ frames: meta.frames, boxes })}\n`);   // the head of every frame, shares of the recording: the face box graphics keep clear of
  rmSync(dest, { recursive: true, force: true });
  renameSync(tmp, dest);
  if (raw) rmSync(raw, { recursive: true, force: true });
  meta.matte = { dir: 'matte/', frames: meta.frames, from: masks ? 'masks' : 'vision', ...(masks ? {} : { quality }), median: 3, feather, face: 'face.json' };
  writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  return { dest, meta };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      name: { type: 'string' }, piece: { type: 'string' }, masks: { type: 'string' }, quality: { type: 'string' }, feather: { type: 'string' } } });
    if (p.length || !v.name) throw fail(usageText('footage matte'), 2);
    const feather = v.feather == null ? 3 : Number(v.feather);
    const { dest, meta } = await matte({ name: v.name, piece: v.piece, masks: v.masks ?? null, quality: v.quality ?? 'accurate', feather });
    const m = meta.matte;
    console.log(`wrote ${m.frames} masks (${meta.w}x${meta.h}; ${m.from === 'vision' ? `Vision, ${m.quality}` : 'supplied masks'}; 3-frame median, feather ${m.feather} px) to ${dest}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage matte')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });

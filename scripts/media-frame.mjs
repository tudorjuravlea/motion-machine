// `mm media frame <png> --name <n> [--piece <dir>]`: a device frame image the user owns
// (a maker's official bezel or a licensed render, with a transparent screen) goes into
// <piece>/assets/frames/<n>.png, and its screen hole is measured: a flood fill from the centre
// through see-through pixels (alpha under one half: the hole, or a reflection over it) gives the hole's box, and the first filled pixel
// along the top-left diagonal gives its corner radius (a rounded corner meets its diagonal at
// r·(1 − 1/√2) from the box corner). <n>.json records { image, screen } in image pixels. The library
// never ships a frame: the user's frames live in the piece (call 3).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { bin } from './lib/ffmpeg.mjs';

const fail = (msg, code = 2) => Object.assign(new Error(msg), { exitCode: code });

function sizeOf(file) {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = String(r.stdout).trim().split(',').map(Number);
  if (r.status !== 0 || !(w > 0 && h > 0)) throw fail(`could not read ${file} as an image`);
  return { w, h };
}

export function measureHole(rgba, w, h) {
  const clear = (x, y) => rgba[(y * w + x) * 4 + 3] < 128;   // see-through: the hole, or glass over it (a mockup's reflection)
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  if (!clear(cx, cy)) return null;
  const seen = new Uint8Array(w * h);
  const stack = [cy * w + cx]; seen[cy * w + cx] = 1;
  let x0 = cx, x1 = cx, y0 = cy, y1 = cy;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && clear(nx, ny)) { seen[j] = 1; stack.push(j); }
    }
  }
  let d = 0;
  while (d < Math.min(x1 - x0, y1 - y0) / 2 && !seen[(y0 + d) * w + (x0 + d)]) d++;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, radius: Math.round(d / (1 - Math.SQRT1_2)) };
}

// --key: a mockup export often fills the screen with a flat placeholder colour. The colour at the
// centre is flood-filled (every channel within 10 levels) and made transparent before measuring.
export function keyScreen(rgba, w, h, tol = 10) {
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2), c0 = (cy * w + cx) * 4;
  const ref = [rgba[c0], rgba[c0 + 1], rgba[c0 + 2]];
  const near = (i) => rgba[i * 4 + 3] >= 128 && Math.abs(rgba[i * 4] - ref[0]) <= tol && Math.abs(rgba[i * 4 + 1] - ref[1]) <= tol && Math.abs(rgba[i * 4 + 2] - ref[2]) <= tol;
  const seen = new Uint8Array(w * h), stack = [cy * w + cx]; seen[cy * w + cx] = 1; let n = 0;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    rgba[i * 4 + 3] = 0; n++;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && near(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  return n;
}

export function frame({ file, name, piece = '.', key = false }) {
  if (!existsSync(file)) throw fail(`not found: ${file}`);
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(name)) throw fail(`--name must be lowercase letters, digits and hyphens: ${name}`);
  const { w, h } = sizeOf(file);
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw fail(`could not decode ${file}: ${String(r.stderr).trim()}`);
  if (key) keyScreen(r.stdout, w, h);
  const screen = measureHole(r.stdout, w, h);
  if (!screen) throw fail(`${file} has no transparent screen at its centre: a device frame must be a PNG whose screen area is transparent (or a flat colour, with --key)`);
  const dir = join(resolve(piece), 'assets', 'frames');
  mkdirSync(dir, { recursive: true });
  if (key) {   // the keyed pixels are written out, not the original file
    const wr = spawnSync(bin('ffmpeg'), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', join(dir, `${name}.png`)], { input: r.stdout, maxBuffer: 1 << 28 });
    if (wr.status !== 0) throw fail(`could not write ${name}.png: ${String(wr.stderr).trim()}`, 1);
  } else copyFileSync(file, join(dir, `${name}.png`));
  const meta = { image: { w, h }, screen };
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  return { dir, meta };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { name: { type: 'string' }, piece: { type: 'string' }, key: { type: 'boolean' } } });
    if (p.length !== 1 || !v.name) throw fail(usageText('media frame'), 2);
    const { dir, meta } = frame({ file: p[0], name: v.name, piece: v.piece, key: !!v.key });
    const s = meta.screen;
    console.log(`wrote ${v.name}.png and ${v.name}.json to ${dir}: screen ${s.w}x${s.h} at ${s.x},${s.y}, radius ${s.radius} (image ${meta.image.w}x${meta.image.h}); use it with "frame": "assets/frames/${v.name}" on a devices/phone or devices/laptop beat`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('media frame')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });

// Renders the motion-capture reference films from the pieces beside this file, so the
// cut instants are known from the kit's own schedule rather than typed by hand. Frames are drawn
// by the kit through scripts/lib/browser.mjs and encoded with ffmpeg; nothing here waits for
// `mm export`. Run: node fixtures/capture/reference/render.mjs [name[:motion] ...]
//   cuts, single: 10 fps at 1920 px.
//   tempo-a:<calm|premium|kinetic>, tempo-b:<...>, kinds: the labelled films of the capture fix
//   lane, 30 fps like an export, encoded at 960 px wide to keep the fixtures small.
//   `tempo-*` reads style-<motion>.json, so one story is rendered under each motion style.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { openPiece, framePng, serveRoot } from '../../../scripts/lib/browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS_OF = { cuts: 10, single: 10 };
const ALL = ['cuts', 'single', 'tempo-a:calm', 'tempo-a:premium', 'tempo-a:kinetic', 'tempo-b:calm', 'tempo-b:premium', 'tempo-b:kinetic', 'kinds'];

async function render(spec, { browser, server }) {
  const [name, motion] = spec.split(':');
  const FPS = FPS_OF[name] ?? 30;
  const piece = await openPiece(join(HERE, 'pieces', name), { format: '16x9', browser, server, query: motion ? { motion } : {} });
  const { duration } = await piece.mm.meta();
  const out = join(HERE, `${motion ? `${name}-${motion}` : name}.mp4`);
  const vf = FPS_OF[name] ? 'format=yuv420p' : 'scale=960:-2,format=yuv420p';
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', vf, '-c:v', 'libx264', '-crf', '18', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`)))));
  const n = Math.round(duration * FPS);
  for (let k = 0; k < n; k++) {
    const png = await framePng(piece.page, k / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  if (piece.errors.length) throw new Error(`${name}: page errors: ${piece.errors.join('; ')}`);
  await piece.close();
  return { name: spec, fps: FPS, frames: n, duration, out };
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const server = await serveRoot();
const browser = await chromium.launch();
try {
  for (const n of names) console.log(JSON.stringify(await render(n, { browser, server })));
} finally {
  await browser.close();
  await server.close();
}

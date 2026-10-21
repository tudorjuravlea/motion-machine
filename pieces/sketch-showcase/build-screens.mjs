#!/usr/bin/env node
// Builds the phone's two screens for the sketch showcase from screen/, a 9:16 piece drawn by the
// kit itself: assets/sketch/ (a frame sequence of the app as a wireframe, shivering on the boil
// clock) and assets/hifi.png (the same layout, finished). Each is rendered at the 3D phone's screen
// ratio (940:2100), the 9:16 page centred between canvas-coloured bands, so the phone shows it whole.
//   node pieces/sketch-showcase/build-screens.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = Math.round((W * 2100) / 940), STAGE = 1920;
const FPS = 10, SECONDS = 12;   // the boil steps every 0.4 s: 10 fps catches every frame of it

const server = await serveRoot(ROOT), browser = await launchBrowser();
try {
  const o = await openPiece(join(HERE, 'screen'), { server, browser, format: '9x16' });
  await o.page.setViewportSize({ width: W, height: H });
  await o.page.addStyleTag({ content: `.mm-stage { margin-top: ${Math.round((H - STAGE) / 2)}px; }` });
  const meta = await o.mm.meta();
  const hifi = meta.schedule.scenes.find((s) => s.id === 'hifi'), sketch = meta.schedule.scenes.find((s) => s.id === 'sketch');
  await o.mm.seek(hifi.start + 1);
  await o.page.screenshot({ path: join(HERE, 'assets/hifi.png') });
  const out = join(HERE, 'assets/sketch');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const frames = FPS * SECONDS;
  for (let i = 0; i < frames; i++) {
    await o.mm.seek(sketch.start + i / FPS);
    await o.page.screenshot({ path: join(out, `f${String(i + 1).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
  }
  writeFileSync(join(out, 'media.json'), JSON.stringify({ kind: 'sequence', fps: FPS, frames, w: W, h: H, duration: SECONDS, source: { file: 'screen/story.json', built: 'build-screens.mjs' } }, null, 2) + '\n');
  await o.close();
  console.log(`assets/hifi.png and assets/sketch/ (${frames} frames, ${W}x${H})`);
} finally { await browser.close(); await server.close(); }

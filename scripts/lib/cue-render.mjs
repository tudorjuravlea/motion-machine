// Renders sound patterns to PCM through Playwright + OfflineAudioContext (Chromium is the one
// Web Audio implementation the repo already ships). Library and CLI.
//   import { renderCue, wavBytes } from './cue-render.mjs'
//   node scripts/lib/cue-render.mjs [cue ...] [--feel soft-ui,percussive,cinematic] [--out dir] [--seconds 2] [--at 0.2]
// Each cue is imported from the served patterns/sound/<cue>/pattern.js and rendered once at `at`
// seconds into an OfflineAudioContext of `seconds` at 48 kHz, mono. Output: <out>/<cue>-<feel>.wav.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { ROOT, serveRoot } from './browser.mjs';

const PAGE = 'fixtures/kit-smoke/film/index.html';   // any served page; the cue modules need an http origin

/** Opens one browser; `render` may be called many times. */
export async function openRenderer() {
  const server = await serveRoot(ROOT);
  let browser, page;
  try {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto(`${server.url}/${PAGE}`, { waitUntil: 'load' });
  } catch (e) {
    await browser?.close().catch(() => {});
    await server.close();
    throw e;
  }
  const render = (jobs, { seconds = 2, sampleRate = 48000 } = {}) => page.evaluate(async ({ jobs, seconds, sampleRate }) => {
    const ctx = new OfflineAudioContext(1, Math.round(seconds * sampleRate), sampleRate);
    for (const j of jobs) {
      const m = (await import(`/patterns/sound/${j.cue}/pattern.js`)).default;
      m.render(ctx, j.at, j.feel, j.opts || {});
    }
    const buf = await ctx.startRendering();
    const f = buf.getChannelData(0);
    const pcm = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
    let bin = '';
    const bytes = new Uint8Array(pcm.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { jobs, seconds, sampleRate }).then((b64) => ({ pcm: Buffer.from(b64, 'base64'), sampleRate }));
  const close = async () => { await browser.close(); await server.close(); };
  return { render, close };
}

/** 16-bit mono PCM -> a RIFF/WAVE file. */
export function wavBytes(pcm, sampleRate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    feel: { type: 'string', default: 'soft-ui,percussive,cinematic' }, out: { type: 'string', default: 'out/cues' },
    seconds: { type: 'string', default: '2' }, at: { type: 'string', default: '0.2' } } });
  const cues = positionals.length ? positionals : readdirSync(join(ROOT, 'patterns/sound'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  const r = await openRenderer();
  for (const cue of cues) for (const feel of values.feel.split(',')) {
    const { pcm, sampleRate } = await r.render([{ cue, at: Number(values.at), feel }], { seconds: Number(values.seconds) });
    writeFileSync(join(out, `${cue}-${feel}.wav`), wavBytes(pcm, sampleRate));
    console.log(`${cue}-${feel}.wav`);
  }
  await r.close();
}

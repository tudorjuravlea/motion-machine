// rasterisation is a function of the frame alone. 120 consecutive frames of a tile-entrance
// fixture (three bento tiles popping in on a spring) rendered twice in one page and once in a fresh
// page are byte-identical, with the Chromium flags every verb and the gate launch with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { LAUNCH_ARGS, ROOT, framePng, launchBrowser, openPiece, serveRoot } from '../../scripts/lib/browser.mjs';

const DIR = join(ROOT, 'fixtures/negatives/_raster');
const FRAMES = 120, FPS = 30;

test('the launch flags pin rasterisation and colour', () => {
  for (const f of ['--disable-partial-raster', '--disable-gpu-rasterization', '--force-color-profile=srgb']) assert.ok(LAUNCH_ARGS.includes(f), f);
});

test('120 frames of tile entrances: twice in one page and once in a fresh page, byte for byte', { timeout: 300_000 }, async () => {
  const browser = await launchBrowser(), server = await serveRoot(ROOT);
  try {
    const pass = async (page) => { const out = []; for (let i = 0; i < FRAMES; i++) out.push(await framePng(page, i / FPS)); return out; };
    const a = await openPiece(DIR, { browser, server });
    const first = await pass(a.page), again = await pass(a.page);
    const b = await openPiece(DIR, { browser, server });
    const fresh = await pass(b.page);
    await a.close(); await b.close();
    const bad = (x) => x.map((f, i) => (f.equals(first[i]) ? null : i)).filter((i) => i != null);
    assert.deepEqual(bad(again), [], 'same page, second pass');
    assert.deepEqual(bad(fresh), [], 'fresh page');
    assert.ok(new Set(first.map((f) => f.toString('base64').slice(-64))).size > 10, 'the frames move');
  } finally { await browser.close(); await server.close(); }
});

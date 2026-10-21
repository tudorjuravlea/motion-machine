// The device pieces' soft glow and shadow are drawn by Chromium in 8-bit premultiplied colour, so
// a faint tail over a dark canvas carries rounding noise. G-BRAND's pixel half tolerates a
// small off-palette area (REGION_MAX) but not a solid one, and the flat bottom edge of a large
// phone is one row of identical pixels, wider than that. The glow has to be faint enough, or
// shaped so, that no shipped preset shows a solid off-palette region around a device at rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng, offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';
import { DELTA_E, REGION_MAX } from '../../scripts/check/G-BRAND.mjs';
import { palette } from '../../scripts/check/_lib.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

const PRESETS = ['editorial', 'kinetic', 'calm-product', 'nocturne-kinetic'];
const SCENES = ['phone-large', 'phone-regular', 'laptop-large', 'laptop-regular'];

for (const preset of PRESETS) {
  for (const format of ['9x16', '16x9']) {
    test(`a device at rest leaves no solid off-palette region: ${preset}, ${format}`, async () => {
      const style = JSON.parse(readFileSync(join(ROOT, 'styles/presets', `${preset}.json`), 'utf8'));
      const dist = paletteDistance([...palette(style).keys()].map((k) => k.split(',').map(Number)));
      const o = await openPiece(PAGE, { server, browser, format, query: { story: 'device-glow', preset } });
      try {
        const { schedule } = await o.mm.meta();
        const worst = [];
        for (const id of SCENES) {
          const sc = schedule.scenes.find((x) => x.id === id);
          const img = decodePng(await framePng(o.page, sc.end - 0.05));
          const r = offPalette(img, dist, DELTA_E, { rect: { x: 0, y: 0, w: img.width, h: img.height } });
          worst.push(`${id}: ${r.largest.size} px`);
          assert.ok(r.largest.size <= REGION_MAX, `${id} at ${(sc.end - 0.05).toFixed(2)} s: a solid region of ${r.largest.size} px (${JSON.stringify(r.largest.box)}) is off the palette`);
        }
      } finally { await o.close(); }
    });
  }
}

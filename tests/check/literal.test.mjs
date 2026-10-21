// G-LITERAL (SPEC §3, §7): the regex half, the computed-colour half, the family half and
// the pixel half.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, failsOnly } from './_harness.mjs';
import { cssLiterals, hexToRgb } from '../../scripts/check/_lib.mjs';
import { decodePng, offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';
import { DELTA_E, OFF_MAX, REGION_MAX } from '../../scripts/check/G-LITERAL.mjs';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { deflateSync } from 'node:zlib';

const run = gate();

test('a hex colour in piece.css fails G-LITERAL with file and line', async () => {
  const r = failsOnly(await run('G-LITERAL/regex'), 'G-LITERAL');
  assert.equal(r.evidence.file, 'piece.css');
  assert.equal(r.evidence.line, 2);
  assert.match(r.evidence.measured, /#6F675B/);
});

test('G-LITERAL/named: a named colour in a text shadow', async () => {
  const r = failsOnly(await run('G-LITERAL/named'), 'G-LITERAL');
  assert.match(r.evidence.reason, /^named colour/);
  assert.match(r.evidence.measured, /crimson/);
});

test('G-LITERAL/computed: a colour set from script is no palette role at a rest', async () => {
  const r = failsOnly(await run('G-LITERAL/computed'), 'G-LITERAL');
  assert.match(r.evidence.selector, /data-slot="sub"/);
  assert.match(r.evidence.measured, /rgb\(46, 110, 160\)/);
  assert.ok(typeof r.evidence.instant === 'number');
});

test('G-LITERAL/family: a computed family that is not a style family', async () => {
  const r = failsOnly(await run('G-LITERAL/family'), 'G-LITERAL');
  assert.match(r.evidence.measured, /Impostor Sans/);
  assert.match(r.evidence.reason, /style family/);
});

test('G-LITERAL/pixel: a filter turns the rendered pixels off the palette', async () => {
  const r = failsOnly(await run('G-LITERAL/pixel'), 'G-LITERAL');
  assert.match(r.evidence.reason, /off the palette/);
  assert.ok(parseFloat(r.evidence.measured) > 50, r.evidence.measured);
});

test('the regexes: variables pass, literals of each kind fail', () => {
  assert.deepEqual(cssLiterals('.a { color: var(--mm-color-ink); transition: none; font-family: var(--mm-font-text); line-height: 1.05; padding: var(--mm-space-2) 0; margin: 0px; }'), []);
  assert.deepEqual(cssLiterals('.a { background: color-mix(in srgb, var(--mm-color-accent) 40%, transparent); }'), [], 'an alpha of one role is a blend');
  const kinds = cssLiterals(`.a { color: #fff; background: rgb(0 0 0); border-color: hsl(0 0% 0%); transition: opacity 300ms cubic-bezier(.2,.7,.2,1);
    font-family: Inter, sans-serif; font-size: 20px; animation-duration: 1.5s; outline-color: oklch(0.6 0.2 30); caret-color: color(srgb 1 0 0);
    fill: tomato; stroke: color-mix(in srgb, var(--mm-color-ink), var(--mm-color-accent)); padding: 12px; border-radius: 8px; --f: "Comic Sans MS", serif; }`).map((h) => h.kind);
  for (const k of ['hex colour', 'rgb()', 'hsl()', 'duration literal', 'cubic-bezier()', 'font-family not var()', 'font-size literal', 'colour function', 'color()',
    'named colour', 'color-mix() of two colours', 'space literal', 'radius literal', 'font family in a custom property']) assert.ok(kinds.includes(k), k);
});

test('pixels: the PNG decoder and the palette distance (roles and two-role blends pass, others do not)', () => {
  const w = 2, h = 1, raw = Buffer.from([0, 255, 0, 0, 0, 0, 255]);   // one RGB row: red, blue (filter 0)
  const chunk = (type, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(type, 4, 'latin1'); body.copy(b, 8); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const img = decodePng(png);
  assert.deepEqual([...img.data], [255, 0, 0, 255, 0, 0, 255, 255]);
  const d = paletteDistance(['#F4EFE6', '#1E1B16', '#B5451B'].map(hexToRgb));
  assert.ok(d(0xF4, 0xEF, 0xE6) < 0.01);
  const mid = [0xF4, 0xEF, 0xE6].map((c, i) => Math.round((c + [0x1E, 0x1B, 0x16][i]) / 2));
  assert.ok(d(...mid) < 1, 'an antialias blend of canvas and ink');
  assert.ok(d(46, 110, 160) > 8, 'a blue that no role or blend explains');
});

test('G-LITERAL/hue: a hue-rotate moving the ink about ΔE 5 fails at the calibrated ΔE 2', async () => {
  const r = failsOnly(await run('G-LITERAL/hue'), 'G-LITERAL');
  assert.match(r.evidence.reason, /off the palette/);
  assert.ok(r.evidence.instant < 5, `a rest of the opening scene: ${r.evidence.instant}`);
  const d = paletteDistance(['#F4EFE6', '#1E1B16', '#6F675B', '#FFFDF8', '#D9D1C2', '#B5451B', '#FFF8F1'].map(hexToRgb));
  const [rr, g, b] = r.evidence.colours[0].match(/\d+/g).map(Number);
  assert.ok(d(rr, g, b) > DELTA_E && d(rr, g, b) < 8, `the shifted ink sits between ΔE ${DELTA_E} and a loose ΔE 8 band: ${d(rr, g, b)}`);
});

test('G-LITERAL/region: a 104x8 recoloured accent rule (0.04 % of the frame) fails the region test', async () => {
  const r = failsOnly(await run('G-LITERAL/region'), 'G-LITERAL');
  assert.equal(r.evidence.measured, '832 px region');
  assert.deepEqual([r.evidence.box.w, r.evidence.box.h], [104, 8]);
});

test('G-LITERAL/mask: a background-image on the wrapper does not mask its box', async () => {
  const r = failsOnly(await run('G-LITERAL/mask'), 'G-LITERAL');
  assert.equal(r.evidence.measured, '832 px region');
  assert.equal(r.evidence.masked, 0);
});

test('G-LITERAL/overlay: a transparent image over the layout masks only itself; what lies behind it is read', async () => {
  const r = failsOnly(await run('G-LITERAL/overlay'), 'G-LITERAL');
  assert.equal(r.evidence.measured, '832 px region');
  assert.equal(r.evidence.masked, 1, 'the image is masked, and the rule behind it still read');
});

test('G-LITERAL/canvas: an author-drawn canvas is measured, not masked', async () => {
  const r = failsOnly(await run('G-LITERAL/canvas'), 'G-LITERAL');
  assert.equal(r.evidence.measured, '5760 px region');
  assert.deepEqual(r.evidence.colours, ['rgb(0,128,255)']);
});

test('G-LITERAL static: piece code may not declare media (data-media is a pattern\'s declaration)', async () => {
  const { runCheck } = await import('../../scripts/check.mjs');
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
  const dir = mkdtempSync(join(ROOT, 'fixtures', 'negatives', '_base', '.tmp-media-'));
  try {
    cpSync(join(ROOT, 'fixtures/negatives/_base/film'), dir, { recursive: true });
    writeFileSync(join(dir, 'piece.js'), "export function after() { document.querySelector('.title-stack').dataset.media = ''; }\n");
    const res = await runCheck(dir, { only: ['G-LITERAL'] });
    const r = res.rules.find((x) => x.id === 'G-LITERAL');
    assert.equal(r.status, 'FAIL');
    assert.match(r.evidence.reason, /media declared by piece code/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('offPalette: off pixels, the largest 4-connected region, and masked pixels read from the frame behind', () => {
  const W = 20, H = 10;
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };   // white
  const paint = (im, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.data.set([...c, 255], (y * W + x) * 4); };
  paint(img, 0, 0, 5, 4, [0, 128, 255]);   // a 20 px block
  paint(img, 10, 0, 1, 1, [0, 128, 255]); paint(img, 11, 1, 1, 1, [0, 128, 255]);   // diagonal neighbours: two regions under 4-connectivity
  const d = paletteDistance(['#FFFFFF', '#000000'].map(hexToRgb));
  let r = offPalette(img, d, 2);
  assert.equal(r.off, 22);
  assert.equal(r.largest.size, 20);
  assert.deepEqual(r.largest.box, { x: 0, y: 0, w: 5, h: 4 });
  const behind = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  paint(behind, 0, 0, 5, 4, [0, 128, 255]);
  r = offPalette(img, d, 2, { masks: [{ x: 0, y: 0, w: 5, h: 4 }] });
  assert.equal(r.off, 2, 'without a frame behind, a masked pixel is skipped');
  r = offPalette(img, d, 2, { masks: [{ x: 0, y: 0, w: 5, h: 4 }], behind });
  assert.equal(r.largest.size, 20, 'what lies behind the media is read');
});

// The calibration behind ΔE 2, 0.5 % and 256 px: every text role on every surface
// role in each preset's faces, rounded bordered tiles, a role at partial opacity, and ink over the
// text/highlight tint up to the 9x16 display size. The four goldens peak at ΔE 1.13 (all formats).
test('calibration: the palette sheet passes the pixel half in all three presets, with margin', async () => {
  const browser = await launchBrowser(), server = await serveRoot(ROOT);
  try {
    for (const preset of ['editorial', 'kinetic', 'calm-product']) {
      const style = JSON.parse(readFileSync(join(ROOT, 'styles/presets', `${preset}.json`), 'utf8'));
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      await page.goto(`${server.url}/fixtures/negatives/_palette/index.html?preset=${preset}`);
      await page.waitForSelector('html[data-ready]');
      const img = decodePng(await page.screenshot({ type: 'png', fullPage: true }));
      await page.close();
      const r = offPalette(img, paletteDistance(Object.values(style.color).map(hexToRgb)), DELTA_E);
      assert.ok(r.off / r.total < OFF_MAX * 0.75, `${preset}: ${(100 * r.off / r.total).toFixed(3)} % off (measured 0.25 to 0.30 %)`);
      assert.ok(r.largest.size < REGION_MAX / 2, `${preset}: largest region ${r.largest.size} px (measured 47 to 95)`);
    }
  } finally { await browser.close(); await server.close(); }
});

test('G-LITERAL/hue-ground: over a brand ground the hue-rotated ink still fails', async () => {
  const r = failsOnly(await run('G-LITERAL/hue-ground'), 'G-LITERAL');
  assert.match(r.evidence.reason, /off the palette/);
});

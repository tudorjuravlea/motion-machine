// G-BRAND (SPEC §3, §7, AXIOM 2): the piece stays the brand. A computed colour no style role owns, a
// computed face no style family owns, and rendered pixels no role, no blend of up to three roles and no
// glow over the ground explains, fail. A region under 2 px in either direction is never a finding, and an
// expressive look made of brand roles passes. Literal syntax that renders on-palette is W-LITERAL's, a
// warning (tests/check/literal.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { gate, failsOnly, row } from './_harness.mjs';
import { hexToRgb } from '../../scripts/check/_lib.mjs';
import { decodePng, offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';
import { DELTA_E, OFF_MAX, REGION_MAX } from '../../scripts/check/G-BRAND.mjs';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';

const run = gate();

test('G-BRAND/computed: a colour set from script is no palette role at a rest', async () => {
  const r = failsOnly(await run('G-BRAND/computed'), 'G-BRAND');
  assert.match(r.evidence.selector, /data-slot="sub"/);
  assert.match(r.evidence.measured, /rgb\(46, 110, 160\)/);
  assert.ok(typeof r.evidence.instant === 'number');
});

test('G-BRAND/family: a computed family that is not a style family', async () => {
  const r = failsOnly(await run('G-BRAND/family'), 'G-BRAND');
  assert.match(r.evidence.measured, /Impostor Sans/);
  assert.match(r.evidence.reason, /style family/);
});

test('G-BRAND/pixel: a filter turns the rendered pixels off the palette', async () => {
  const r = failsOnly(await run('G-BRAND/pixel'), 'G-BRAND');
  assert.match(r.evidence.reason, /off the palette/);
  assert.ok(parseFloat(r.evidence.measured) > 50, r.evidence.measured);
});

test('G-BRAND/hue: a hue-rotate moving the ink about ΔE 5 fails at the calibrated ΔE 2', async () => {
  const r = failsOnly(await run('G-BRAND/hue'), 'G-BRAND');
  assert.match(r.evidence.reason, /off the palette/);
  assert.ok(r.evidence.instant < 5, `a rest of the opening scene: ${r.evidence.instant}`);
  const d = paletteDistance(['#F4EFE6', '#1E1B16', '#6F675B', '#FFFDF8', '#D9D1C2', '#B5451B', '#FFF8F1'].map(hexToRgb));
  const [rr, g, b] = r.evidence.colours[0].match(/\d+/g).map(Number);
  assert.ok(d(rr, g, b) > DELTA_E && d(rr, g, b) < 8, `the shifted ink sits between ΔE ${DELTA_E} and a loose ΔE 8 band: ${d(rr, g, b)}`);
});

test('G-BRAND/hue-ground: over a brand ground the hue-rotated ink still fails', async () => {
  const r = failsOnly(await run('G-BRAND/hue-ground'), 'G-BRAND');
  assert.match(r.evidence.reason, /off the palette/);
});

test('G-BRAND/region: a 104x8 recoloured accent rule (0.04 % of the frame) fails the region test', async () => {
  const r = failsOnly(await run('G-BRAND/region'), 'G-BRAND');
  assert.equal(r.evidence.measured, '832 px region');
  assert.deepEqual([r.evidence.box.w, r.evidence.box.h], [104, 8]);
});

test('G-BRAND/stripes: 1 px stripes of an unowned colour over half the frame fail the share test', async () => {
  const r = failsOnly(await run('G-BRAND/stripes'), 'G-BRAND', { inherent: ['W-LITERAL', 'W-CONTRAST'] });   // a literal hex, and an overlay that lowers contrast
  assert.match(r.evidence.reason, /of the rendered pixels are off the palette/);
  assert.ok(parseFloat(r.evidence.measured) > 40, r.evidence.measured);
  assert.deepEqual(r.evidence.colours, ['rgb(255,0,255)']);
});

test('G-BRAND/checker: a 1 px checkerboard of an unowned colour over half the frame fails the share test', async () => {
  const r = failsOnly(await run('G-BRAND/checker'), 'G-BRAND', { inherent: ['W-LITERAL', 'W-CONTRAST'] });
  assert.match(r.evidence.reason, /of the rendered pixels are off the palette/);
  assert.ok(parseFloat(r.evidence.measured) > 40, r.evidence.measured);
});

test('G-BRAND/no-rest: an unowned headline colour in a scene with motion across its cut fails', async () => {
  const r = failsOnly(await run('G-BRAND/no-rest'), 'G-BRAND', { inherent: ['W-SCENE-END', 'W-HOLD', 'W-DEAD', 'W-READ', 'W-EMPTY', 'W-LITERAL'] });
  assert.match(r.evidence.selector, /data-scene="style"/);
  assert.match(r.evidence.measured, /rgb\(255, 0, 255\)/);
});

test('G-BRAND/mask: a background-image on the wrapper does not mask its box', async () => {
  const r = failsOnly(await run('G-BRAND/mask'), 'G-BRAND');
  assert.equal(r.evidence.measured, '832 px region');
  assert.equal(r.evidence.masked, 0);
});

test('G-BRAND/overlay: a transparent image over the layout masks only itself; what lies behind it is read', async () => {
  const r = failsOnly(await run('G-BRAND/overlay'), 'G-BRAND');
  assert.equal(r.evidence.measured, '832 px region');
  assert.equal(r.evidence.masked, 1, 'the image is masked, and the rule behind it still read');
});

test('G-BRAND/canvas: an author-drawn canvas is measured, not masked', async () => {
  const r = failsOnly(await run('G-BRAND/canvas'), 'G-BRAND');
  assert.equal(r.evidence.measured, '5760 px region');
  assert.deepEqual(r.evidence.colours, ['rgb(0,128,255)']);
});

test('G-BRAND/named: a crimson glow, a colour the brand does not own carrying visible area, fails; W-LITERAL reads the same text as syntax', async () => {
  const res = await run('G-BRAND/named');
  const r = failsOnly(res, 'G-BRAND', { inherent: ['W-LITERAL'] });
  assert.match(r.evidence.reason, /off the palette/);
  const lit = row(res, 'W-LITERAL');
  assert.equal(lit.status, 'WARN');
  assert.match(lit.evidence.reason, /^named colour/);
  assert.match(lit.evidence.measured, /crimson/);
});

test('G-BRAND/expressive: a three-stop gradient of brand roles with a glow laid over it passes', async () => {
  const res = await run('G-BRAND/expressive');
  const r = row(res, 'G-BRAND');
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.equal(res.code, 0);
  assert.deepEqual(res.rules.filter((x) => x.status === 'FAIL' || x.status === 'WARN').map((x) => x.id), [], 'a look made of roles draws no finding at all');
  assert.ok(parseFloat(r.evidence.measured) < OFF_MAX * 100 / 2, `well inside the budget: ${r.evidence.measured}`);
});

// Finishes made of brand roles pass: a multiply or screen blend of roles, and a vignette toward the
// darkest role. Black is not a role and a grade moves the roles themselves, so those fail.
for (const dir of ['blend-multiply', 'blend-screen', 'vignette-ink']) {
  test(`G-BRAND/${dir}: a finish made of brand roles passes`, async () => {
    const res = await run(`G-BRAND/${dir}`);
    const r = row(res, 'G-BRAND');
    assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
    assert.equal(res.code, 0);
    assert.deepEqual(res.rules.filter((x) => x.status === 'FAIL').map((x) => x.id), []);   // a disc or a vignette over type may lower W-CONTRAST; that is advice
  });
}

// A look is part of the brand: the style declares it (`finish.look`), the stage wears it, and the gate reads
// the palette through the same tone tables. A grade the style did not declare, on top of it, still fails.
test('G-BRAND/look-faded: a piece wearing the look its style declares is the brand', async () => {
  const res = await run('G-BRAND/look-faded');
  const r = row(res, 'G-BRAND');
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.deepEqual(res.rules.filter((x) => x.status === 'FAIL').map((x) => x.id), []);
});

test('G-BRAND/look-extra-grade: a grade the style did not declare, over a declared look, fails', async () => {
  const r = failsOnly(await run('G-BRAND/look-extra-grade'), 'G-BRAND', { inherent: ['W-LITERAL', 'W-CONTRAST'] });
  assert.match(r.evidence.reason, /off the palette/);
});

for (const dir of ['vignette-black', 'grade-contrast', 'grade-saturate']) {
  test(`G-BRAND/${dir}: a finish that is not made of brand roles fails`, async () => {
    const r = failsOnly(await run(`G-BRAND/${dir}`), 'G-BRAND', { inherent: ['W-LITERAL', 'W-CONTRAST'] });
    assert.match(r.evidence.reason, /off the palette/);
  });
}

test('pixels: a multiply or screen of roles is explained; black is not a role', () => {
  const roles = ['#F4EFE6', '#1E1B16', '#B5451B'].map(hexToRgb);
  const d = paletteDistance(roles);
  const [accent, canvas] = [roles[2], roles[0]];
  const mul = (...cs) => [0, 1, 2].map((k) => Math.round(cs.reduce((v, c) => (v * c[k]) / 255, 255)));
  assert.ok(d(...mul(accent, accent)) <= DELTA_E, 'accent x accent');
  assert.ok(d(...mul(accent, accent, canvas)) <= DELTA_E, 'two accent discs over the canvas');
  const screen = (a, b) => [0, 1, 2].map((k) => Math.round(255 - ((255 - a[k]) * (255 - b[k])) / 255));
  assert.ok(d(...screen(accent, roles[1])) <= DELTA_E, 'accent screened over ink');
  assert.ok(d(...mul(roles[1], accent)) <= DELTA_E, 'ink under an accent disc');
  assert.ok(d(0, 0, 0) > DELTA_E, 'black is no role');
  assert.ok(d(...mul(roles[1], roles[1])) > DELTA_E, 'ink x ink is darker than the darkest role');
  assert.ok(d(26, 23, 19) > DELTA_E, 'ink darkened a little by a black overlay is off');
  assert.ok(d(46, 110, 160) > 8, 'a blue stays unexplained');
});

test('G-BRAND static: piece code may not declare media (data-media is a pattern\'s declaration)', async () => {
  const { runCheck } = await import('../../scripts/check.mjs');
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
  const dir = mkdtempSync(join(ROOT, 'fixtures', 'negatives', '_base', '.tmp-media-'));
  try {
    cpSync(join(ROOT, 'fixtures/negatives/_base/film'), dir, { recursive: true });
    writeFileSync(join(dir, 'piece.js'), "export function after() { document.querySelector('.title-stack').dataset.media = ''; }\n");
    const res = await runCheck(dir, { only: ['G-BRAND'] });
    const r = res.rules.find((x) => x.id === 'G-BRAND');
    assert.equal(r.status, 'FAIL');
    assert.match(r.evidence.reason, /media declared by piece code/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the pixel reading ----------------------------------------------------------------------------

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

test('pixels: a blend across three roles is explained, and a colour outside their hull is not', () => {
  const roles = ['#F4EFE6', '#1E1B16', '#B5451B'].map(hexToRgb);
  const three = (a, b, c) => [0, 1, 2].map((k) => Math.round(0.25 * roles[0][k] * a + 0.5 * roles[1][k] * b + 0.25 * roles[2][k] * c));
  const pixel = three(1, 1, 1);   // 0.25 canvas + 0.5 ink + 0.25 accent: inside the triangle, on none of its edges
  const pairsOnly = paletteDistance(roles, { blend: 2 });
  const hull = paletteDistance(roles);
  assert.ok(pairsOnly(...pixel) > DELTA_E, `a two-role reading cannot explain it: ${pairsOnly(...pixel)}`);
  assert.ok(hull(...pixel) <= DELTA_E, `a three-role blend is explained: ${hull(...pixel)}`);
  assert.ok(hull(46, 110, 160) > 8, 'a blue outside the hull of canvas, ink and accent stays unexplained');
  assert.ok(hull(0, 160, 90) > 8, 'a green outside the hull stays unexplained');
});

test('offPalette: off pixels, the largest 4-connected region, and masked pixels read from the frame behind', () => {
  const W = 20, H = 10;
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };   // white
  const paint = (im, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.data.set([...c, 255], (y * W + x) * 4); };
  paint(img, 0, 0, 5, 4, [0, 128, 255]);   // a 20 px block
  paint(img, 10, 0, 1, 1, [0, 128, 255]); paint(img, 11, 1, 1, 1, [0, 128, 255]);   // diagonal neighbours: two regions under 4-connectivity, each under 2 px
  const d = paletteDistance(['#FFFFFF', '#000000'].map(hexToRgb));
  let r = offPalette(img, d, 2);
  assert.equal(r.off, 20, 'the two single pixels are thinner than 2 px and never count');
  assert.equal(r.largest.size, 20);
  assert.deepEqual(r.largest.box, { x: 0, y: 0, w: 5, h: 4 });
  const behind = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  paint(behind, 0, 0, 5, 4, [0, 128, 255]);
  r = offPalette(img, d, 2, { masks: [{ x: 0, y: 0, w: 5, h: 4 }] });
  assert.equal(r.off, 0, 'without a frame behind, a masked pixel is skipped');
  r = offPalette(img, d, 2, { masks: [{ x: 0, y: 0, w: 5, h: 4 }], behind });
  assert.equal(r.largest.size, 20, 'what lies behind the media is read');
});

test('offPalette: a region under 2 px tall or under 2 px wide is never a finding; 2 x 2 is', () => {
  const W = 40, H = 12;
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  const paint = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set([0, 128, 255, 255], (y * W + x) * 4); };
  const d = paletteDistance(['#FFFFFF', '#000000'].map(hexToRgb));
  paint(0, 0, 30, 1);   // a hairline 30 px long: antialiasing along an edge
  paint(0, 3, 1, 8);    // and one standing up
  let r = offPalette(img, d, 2);
  assert.equal(r.off, 0);
  assert.equal(r.largest.size, 0);
  assert.equal(r.largest.box, null);
  paint(10, 5, 2, 2);
  r = offPalette(img, d, 2);
  assert.equal(r.off, 4, 'a 2 x 2 block counts');
  assert.equal(r.largest.size, 4);
});

test('offPalette: thin regions are left out of the region test but counted in `all`, the share', () => {
  const W = 40, H = 12;
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 2) img.data.set([0, 128, 255, 255], (y * W + x) * 4);   // 1 px stripes
  const d = paletteDistance(['#FFFFFF', '#000000'].map(hexToRgb));
  const r = offPalette(img, d, 2);
  assert.equal(r.off, 0, 'no stripe is a region');
  assert.equal(r.largest.size, 0);
  assert.equal(r.thin, 20 * H);
  assert.equal(r.all, 20 * H, 'every off pixel counts toward the share');
  assert.deepEqual(r.colours, ['rgb(0,128,255)'], 'the colours name what the share found');
});

// The calibration behind ΔE 2, the share and the region size: every text role on every surface
// role in each preset's faces, rounded bordered tiles, a role at partial opacity, and ink over the
// text/highlight tint up to the 9x16 display size.
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
      assert.ok(r.all / r.total < OFF_MAX / 2, `${preset}: ${(100 * r.all / r.total).toFixed(3)} % off (thin regions included)`);
      assert.ok(r.largest.size < REGION_MAX / 2, `${preset}: largest region ${r.largest.size} px`);
    }
  } finally { await browser.close(); await server.close(); }
});

// The glass surface on a page (SPEC §3): a card that opts in with `surface: glass` (a beat's param, or
// the brand's default for the pattern in `patterns`) wears the brand's tint, a blurred backdrop, a
// hairline, a top highlight and a shadow, and one shine bar crosses it as it arrives; `flat` is
// exactly what the pattern always was.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}, story = 'ground-glass', format = '16x9') => openPiece(PAGE, { server, browser, format, query: { story, preset: 'obsidian-premium', ...query } });
const FLAT = { patternsJson: JSON.stringify({ 'data/stat-tile': { surface: 'flat' }, 'layouts/bento-3': { surface: 'flat' } }) };
const GLASS = { patternsJson: JSON.stringify({ 'data/stat-tile': { surface: 'glass' }, 'layouts/bento-3': { surface: 'glass' } }) };
const look = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel), cs = getComputedStyle(el);
  return { glass: el.closest('[data-surface="glass"]') != null && el.closest('[data-glass]') != null, backdrop: cs.backdropFilter, shadow: cs.boxShadow, image: cs.backgroundImage, bg: cs.backgroundColor, shineX: el.style.getPropertyValue('--mm-shine-x') };
}, selector);
const STAT = '[data-scene="figure"] [data-slot="headline"]';
const TILE = (n) => `[data-scene="tiles"] [data-slot="tile-${n}"]`;
const SIDE = (s) => `[data-scene="versus"] [data-slot="${s}"]`;   // comparison's sides carry no data-glass: a brand's default for the layout changes nothing there

test('flat is the default and changes nothing: no blur behind, no glass shadow, no gradient fill', async () => {
  const o = await open({ ...FLAT, surfaceJson: JSON.stringify({}) });
  try {
    for (const [t, sel] of [[3.5, STAT], [7.5, TILE(2)], [11.5, SIDE('left')]]) {
      await o.mm.seek(t);
      const l = await look(o.page, sel);
      assert.equal(l.backdrop, 'none', sel);
      assert.equal(l.shadow, 'none', sel);
      assert.equal(l.image, 'none', sel);
      assert.equal(l.shineX, '', sel);
    }
  } finally { await o.close(); }
});

test('the brand\'s default for a pattern makes it glass: a blurred backdrop, a gradient tint, a hairline, a highlight and a shadow', async () => {
  const o = await open({ ...GLASS, surfaceJson: JSON.stringify({ blur: 0.012 }) });
  try {
    for (const [t, sel] of [[3.5, STAT], [7.5, TILE(2)], [7.5, TILE(3)]]) {
      await o.mm.seek(t);
      const l = await look(o.page, sel);
      assert.ok(l.glass, sel);
      assert.match(l.backdrop, /blur\(23\.04px\)/, `${sel}: the blur is 1.2 % of the frame width`);
      assert.match(l.shadow, /inset/, `${sel}: a hairline and a top highlight, inside`);
      assert.equal((l.shadow.match(/rgba?\(|color\(/g) ?? []).length, 3, `${sel}: hairline, highlight, shadow`);
      assert.match(l.image, /linear-gradient/, `${sel}: the diagonal tint`);
      assert.equal(l.shineX, '', `${sel}: no shine at a rest`);
    }
    // the lead tile keeps its accent fill and takes the edge and the shine, with no blur
    await o.mm.seek(7.5);
    const lead = await look(o.page, TILE(1));
    assert.equal(lead.backdrop, 'none');
    assert.match(lead.shadow, /inset/);
    assert.equal(lead.bg, 'rgb(124, 156, 255)', 'still the accent (obsidian\'s #7C9CFF)');
  } finally { await o.close(); }
});

test('the brand sets the look once: its tint, blur and hairline reach every glass card', async () => {
  const strong = await open({ ...GLASS, surfaceJson: JSON.stringify({ tint: 0.9, blur: 0.03, border: 1 }) });
  const weak = await open({ ...GLASS, surfaceJson: JSON.stringify({ tint: 0.1, blur: 0.005, border: 0 }) });
  try {
    await strong.mm.seek(7.5); await weak.mm.seek(7.5);
    const a = await look(strong.page, TILE(2)), b = await look(weak.page, TILE(2));
    assert.match(a.backdrop, /blur\(57\.6px\)/);
    assert.match(b.backdrop, /blur\(9\.6px\)/);
    assert.notEqual(a.image, b.image);
    assert.notEqual(a.shadow, b.shadow);
  } finally { await strong.close(); await weak.close(); }
});

test('a beat\'s surface param opts a card in, or out of the brand\'s default', async () => {
  const flatBrand = await open(FLAT, 'surface-params');
  const glassBrand = await open(GLASS, 'surface-params');
  try {
    await flatBrand.mm.seek(3.5);
    assert.ok((await look(flatBrand.page, STAT)).glass, 'stat-tile: surface glass in a beat over a flat brand');
    await flatBrand.mm.seek(7.5);
    assert.equal((await look(flatBrand.page, TILE(2))).backdrop, 'none', 'bento-3 stays flat');
    await flatBrand.mm.seek(11.5);
    assert.equal((await look(flatBrand.page, SIDE('left'))).backdrop, 'none', 'a layout that marks no card data-glass has nothing to dress, whatever its beats ask');
    await glassBrand.mm.seek(7.5);
    const t2 = await look(glassBrand.page, TILE(2));
    assert.equal(t2.backdrop, 'none', 'bento-3: a beat\'s flat over a glass brand');
    assert.equal(t2.glass, false);
  } finally { await flatBrand.close(); await glassBrand.close(); }
});

test('the shine crosses a glass card once as it arrives, and is gone before it rests', async () => {
  const o = await open(GLASS);
  try {
    const x = async (t) => { await o.mm.seek(t); return o.page.evaluate((sel) => document.querySelector(sel).style.getPropertyValue('--mm-shine-x'), STAT); };
    // the tile arrives at 0.3 s over the theme's slow duration (0.9 s): the sweep is the last 70 % of it
    assert.equal(await x(0), '');
    assert.equal(await x(0.45), '', 'not yet');
    const seen = [];
    for (const t of [0.6, 0.75, 0.9, 1.05, 1.19]) { const v = await x(t); assert.notEqual(v, '', `${t} s`); seen.push(parseFloat(v)); }
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] < seen[i - 1], `moving across: ${seen}`);
    assert.equal(await x(1.3), '', 'gone when the entrance ends');
    assert.equal(await x(3), '', 'and at rest');
    assert.ok((await framePng(o.page, 0.9)).equals(await framePng(o.page, 0.9)), 'pure in t');
    await framePng(o.page, 3); await framePng(o.page, 0.7);
    assert.ok((await framePng(o.page, 0.9)).equals(await framePng(o.page, 0.9)), 'any seek order');
  } finally { await o.close(); }
});

test('the backdrop is blurred: dots behind a clear glass pane dissolve, and stay sharp when the blur is 0', async () => {
  const dots = { groundJson: JSON.stringify({ kind: 'dots', dots: { role: 'ink', spacing: 0.02, size: 0.3, strength: 1 } }) };
  const sd = (img, r) => {
    const v = [];
    for (let y = Math.round(r.y); y < Math.round(r.y + r.h); y++) for (let x = Math.round(r.x); x < Math.round(r.x + r.w); x++) v.push(img.data[(y * img.width + x) * 4 + 1]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  const measure = async (blur) => {
    const o = await open({ ...GLASS, ...dots, surfaceJson: JSON.stringify({ tint: 0, blur, shine: 0, shadow: 0, highlight: 0, border: 0 }) });
    try {
      await o.mm.seek(7.5);
      const side = await o.page.evaluate(() => { const r = document.querySelector('[data-scene="tiles"] [data-slot="tile-2"]').getBoundingClientRect(); return { x: r.x + r.width * 0.55, y: r.y + r.height * 0.15, w: r.width * 0.4, h: r.height * 0.4 }; });
      const img = decodePng(await framePng(o.page, 7.5));
      return { through: sd(img, side), open: sd(img, { x: side.x, y: 20, w: side.w, h: side.h * 0.5 }) };
    } finally { await o.close(); }
  };
  const blurred = await measure(0.02), sharp = await measure(0);
  assert.ok(sharp.open > 5, `the dots are there: ${sharp.open}`);
  assert.ok(blurred.through < blurred.open * 0.35, `behind blurred glass the dots dissolve: ${blurred.through} against ${blurred.open}`);
  assert.ok(sharp.through > sharp.open * 0.5, `with no blur they show through: ${sharp.through} against ${sharp.open}`);
});

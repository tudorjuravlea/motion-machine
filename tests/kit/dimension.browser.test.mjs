// emphasis/dimension: a measure drawn across what it measures: extension lines at both ends, a line
// that grows from the middle out, 45° ticks that land at its ends, and the slot's own text (the value)
// centred on it. By default the line spans the slot's own text from its first glyph's ink to its last
// (and passes under it); with `for: <slot>` it spans that slot's ink (the headline above) with the
// value in a gap. The ticks sit at the ink edges within a pixel, measured here from the screenshot's
// own pixels. The drawing is the slot's own style, so it holds at every rest; the emphasis plays the
// draw. The value is always level text in the DOM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'dimension-test');
const story = {
  id: 'dimension-test', kind: 'film', formats: ['9x16', '16x9'], title: 'dimension test', language: 'en',
  facts: [{ id: 'w', text: 'Width of the demo device', source: 'test fixture, an invented figure' }],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{
    id: 's', layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Thin all round' },
      { at: 1, slot: 'sub', fx: 'entrances/fade', text: '128 mm', fact: 'w', params: { instant: true }, emphasis: 'emphasis/dimension' },
    ],
  }, {
    id: 'f', layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Narrow enough to hold' },
      { at: 0.6, slot: 'sub', fx: 'entrances/fade', text: '71.5 mm', fact: 'w', params: { instant: true, for: 'headline' }, emphasis: 'emphasis/dimension' },
    ],
  }, {
    id: 'v', layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Tall' },
      { at: 0.4, slot: 'sub', fx: 'entrances/fade', text: '64 mm', params: { instant: true, axis: 'y' }, emphasis: 'emphasis/dimension' },
    ],
  }, {
    id: 'n', layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Wide' },
      { at: 0.4, slot: 'sub', fx: 'entrances/fade', text: '90 mm', emphasis: 'emphasis/dimension' },
    ],
  }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser, dir, blue;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'paper');
  const style = join(OUT, 'paper.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  blue = join(OUT, 'blueprint');
  rmSync(blue, { recursive: true, force: true });
  newPiece({ kind: 'film', style: join(ROOT, 'styles/presets/blueprint.json'), dir: blue });
  writeFileSync(join(blue, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const SUB = '[data-scene="s"] [data-slot="sub"]', RIGHT = '[data-scene="v"] [data-slot="sub"]';
const probe = (o, sel) => o.page.evaluate((sel) => {
  const el = document.querySelector(sel), cs = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const half = (w) => { const p = getComputedStyle(el, w); return { content: p.content, bg: p.backgroundImage, w: parseFloat(p.width), h: parseFloat(p.height) }; };
  const r = el.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect();
  return {
    accent: rgb(getComputedStyle(el, '::before').getPropertyValue('--mm-dim-ink').trim() || root.getPropertyValue('--mm-color-accent').trim()), ink: rgb(root.getPropertyValue('--mm-color-ink').trim()),
    color: cs.color, transform: cs.transform, rotate: cs.rotate, scale: cs.scale, writing: cs.writingMode,
    vars: ['grow', 'ext', 'tick', 'label'].map((k) => el.style.getPropertyValue(`--mm-dim-${k}`)),
    before: half('::before'), after: half('::after'), box: { x: r.left, y: r.top, w: r.width, h: r.height }, text: { x: t.left, y: t.top, w: t.width, h: t.height },
  };
}, sel);
const emphasisOf = async (o, sel) => (await o.mm.meta()).schedule.items.find((it) => it.selector === sel).emphasis;
const near = (px, [r, g, b]) => Math.abs(px[0] - r) + Math.abs(px[1] - g) + Math.abs(px[2] - b) < 40;
const parse = (c) => c.match(/\d+/g).slice(0, 3).map(Number);

// Ink edges read from a screenshot: in a box of the page, the columns holding a pixel at least half
// way from the canvas colour to `color` (a palette colour); [first, last] column, or null.
async function inkCols(o, box, color) {
  const png = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled' }));
  const canvas = parse(await o.page.evaluate(() => { const d = document.createElement('i'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }));
  const c = parse(color), span = c.map((v, k) => v - canvas[k]), len2 = span.reduce((a, v) => a + v * v, 0);
  let lo = Infinity, hi = -Infinity;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(png.height, Math.ceil(box.y + box.h)); y++) for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(png.width, Math.ceil(box.x + box.w)); x++) {
    const i = (y * png.width + x) * 4;
    const t = [0, 1, 2].reduce((a, k) => a + (png.data[i + k] - canvas[k]) * span[k], 0) / len2;
    const off = [0, 1, 2].reduce((a, k) => a + Math.abs(png.data[i + k] - (canvas[k] + t * span[k])), 0);   // near the canvas-to-colour line, not another colour
    if (t >= 0.5 && off < 60) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  }
  return lo <= hi ? [lo, hi] : null;
}
const boxOfSel = (o, sel) => o.page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);

test('at rest by default: level value text in ink, the line in accent spanning the value\'s own ink, from its first glyph to its last', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const e = await emphasisOf(o, SUB);
      assert.ok(e && e.d > 0, 'the beat has an emphasis');
      await o.mm.seek(e.start + e.d + 0.2);
      const s = await probe(o, SUB);
      assert.equal(s.color, s.ink, 'the value is ink');
      for (const k of ['transform', 'rotate', 'scale']) assert.equal(s[k], 'none', `level text (${k})`);
      assert.deepEqual(s.vars, ['', '', '', ''], 'nothing written inline at rest: the drawing is the slot\'s style');
      for (const h of [s.before, s.after]) { assert.notEqual(h.content, 'none'); assert.ok(h.w > 20, `each half has length: ${h.w}`); assert.match(h.bg, /linear-gradient/); }
      // the value's ink (its own pixels, in ink) and the line's (in accent) start and end in the same columns
      const box = await boxOfSel(o, SUB);
      const text = await inkCols(o, { x: box.x, y: s.text.y, w: box.w, h: s.text.h }, s.ink);
      const line = await inkCols(o, { x: box.x - 4, y: box.y, w: box.w + 8, h: box.h + 4 }, s.accent);
      assert.ok(text && line, `${format}: both drawn`);
      assert.ok(Math.abs(text[0] - line[0]) <= 1 && Math.abs(text[1] - line[1]) <= 1, `${format}: the line spans the value's ink: line ${line}, text ${text}`);
      // and passes under it: the line's accent sits below the value's ink
      const under = await inkCols(o, { x: box.x, y: s.text.y, w: box.w, h: s.text.h * 0.8 }, s.accent);
      assert.equal(under, null, `${format}: no accent across the value itself`);
    } finally { await o.close(); }
  }
});

for (const [name, which] of [['paper', () => dir], ['blueprint', () => blue]]) {
  test(`for: headline · ${name}: the line spans exactly the headline's ink, ticks at its two ink edges, the value centred on it`, async () => {
    for (const format of ['16x9', '9x16']) {
      const o = await openPiece(which(), { server, browser, format });
      try {
        const sel = '[data-scene="f"] [data-slot="sub"]', head = '[data-scene="f"] [data-slot="headline"]';
        const e = await emphasisOf(o, sel);
        await o.mm.seek(e.start + e.d + 0.3);
        const s = await probe(o, sel);
        assert.deepEqual(s.vars, ['', '', '', ''], 'nothing written inline at rest');
        const hb = await boxOfSel(o, head), sb = await boxOfSel(o, sel);
        const hink = await inkCols(o, hb, s.ink);
        const line = await inkCols(o, { x: 0, y: sb.y - 2, w: format === '16x9' ? 1920 : 1080, h: sb.h + 4 }, s.accent);
        assert.ok(hink && line, `${format}: both drawn ${hink} ${line}`);
        assert.ok(Math.abs(hink[0] - line[0]) <= 1 && Math.abs(hink[1] - line[1]) <= 1, `${format}: ticks at the headline's ink edges: line ${line}, headline ${hink}`);
        const mid = (hink[0] + hink[1] + 1) / 2;
        assert.ok(Math.abs(s.text.x + s.text.w / 2 - mid) <= 1, `${format}: the value centred on the line (${s.text.x + s.text.w / 2} vs ${mid})`);
        assert.ok(s.before.w > 20 && s.after.w > 20 && Math.abs(s.before.w - s.after.w) <= 1, `${format}: two equal halves ${s.before.w} ${s.after.w}`);
      } finally { await o.close(); }
    }
  });
}

test('the draw: extension lines first, the line grows from the middle, the ticks land at the end, then the value', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const e = await emphasisOf(o, SUB);
    const v = async (q) => { await o.mm.seek(e.start + q * e.d); return (await probe(o, SUB)).vars.map(Number); };
    let [grow, ext, tick, label] = await v(0);
    assert.deepEqual([grow, ext, tick, label], [0, 0, 0, 0], 'nothing is drawn at the start of the window');
    [grow, ext, tick, label] = await v(0.25);
    assert.ok(ext > 0.99, `the extension lines are in: ${ext}`);
    assert.ok(grow > 0 && grow < 1, `the line is growing: ${grow}`);
    assert.equal(tick, 0, 'no tick before the line arrives');
    [grow, ext, tick, label] = await v(0.8);
    assert.ok(grow > 0.999 && tick === 1, `the line has landed with its ticks: ${grow}, ${tick}`);
    assert.ok(label > 0, 'the value is coming in');
    const mid = await probe(o, SUB);
    for (const k of ['transform', 'rotate', 'scale']) assert.equal(mid[k], 'none', `the value never turns (${k})`);
  } finally { await o.close(); }
});

test('axis y: the halves stand above and below the value, and the value stays level', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    const e = await emphasisOf(o, RIGHT);
    await o.mm.seek(e.start + e.d + 0.2);
    const s = await probe(o, RIGHT);
    for (const k of ['transform', 'rotate', 'scale']) assert.equal(s[k], 'none', `level text (${k})`);
    assert.equal(s.writing, 'horizontal-tb');
    assert.ok(s.before.h > 20 && s.after.h > 20, `each half has height: ${s.before.h}, ${s.after.h}`);
    assert.ok(s.text.y > s.box.y + 20 && s.text.y + s.text.h < s.box.y + s.box.h - 20, 'the value sits between the halves');
  } finally { await o.close(); }
});

test('without instant: true the drawing arrives with its entrance and is not drawn again; mm.warnings says so', async () => {
  const sel = '[data-scene="n"] [data-slot="sub"]';
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.selector === sel);
    assert.ok(it.d > 0, 'the beat has an entrance');
    for (const q of [0.05, 0.3, 0.7]) {
      await o.mm.seek(it.emphasis.start + q * it.emphasis.d);
      const s = await probe(o, sel);
      assert.deepEqual(s.vars, ['', '', '', ''], `no redraw at ${q} of the window: ${s.vars}`);
      assert.equal(s.color, s.ink, 'the value stays whole');
    }
    const w = (await o.mm.meta()).warnings.filter((x) => /emphasis\/dimension/.test(x));
    assert.equal(w.length, 1, JSON.stringify(w));
    assert.match(w[0], /instant: true/);
  } finally { await o.close(); }
});

// text/garden: ornament grows out of the headline's letters and rests complete and still. Proved
// here on two brands of opposite polarity (paper, nocturne) and three formats: the front layer
// covers at most 8 % of the glyph ink at rest (pixels), the ornament stays inside --mm-safe and off
// the other text block, every ornament colour is a palette role, the type is exactly the type of a
// plain entrance, frames are the same in forward and reverse seek order, and the rest is still.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'garden-test');
const KINDS = ['vines', 'flowers', 'circuits', 'crystals'];
const TEXT = { vines: 'Grow slowly', flowers: 'Always growing', circuits: 'Built to connect', crystals: 'Clear value' };
const scene = (id, fx, text, params = {}) => ({
  id, layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.2, slot: 'headline', fx, text, params: { dur: 2.4, ...params } },
    { at: 2.8, slot: 'sub', fx: 'entrances/fade', text: 'A line under the headline.' },
  ],
});
const story = (scenes) => ({
  id: 'garden-test', kind: 'film', formats: ['9x16', '1x1', '16x9'], title: 'garden test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
// the hook scene comes first (its headline is a step larger), so every compared scene is a later one
const SCENES = [
  scene('sway', 'text/garden', TEXT.flowers, { kind: 'flowers', seed: 3, sway: 'breathe' }),
  ...KINDS.map((k) => scene(k, 'text/garden', TEXT[k], { kind: k, seed: 3 })),
  scene('bare', 'entrances/fade', TEXT.vines),
];

function piece(brand) {
  const dir = join(OUT, brand);
  rmSync(dir, { recursive: true, force: true });
  const style = join(OUT, `${brand}.style.json`);
  composeToFile({ brand, motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(SCENES), null, 2));
  return dir;
}

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const b of ['paper', 'nocturne']) dirs[b] = piece(b);
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (brand, format) => openPiece(dirs[brand], { server, browser, format });
const headline = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
const restOf = async (o, id) => { const it = await headline(o, id); return it.start + it.d + 0.3; };
// after the line under the headline has landed: the scene's settled picture
const settled = async (o, id) => { const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === id && !x.parent && x.beat?.slot === 'sub'); return it.start + it.d + 0.05; };
const sel = (id, slot = 'headline') => `[data-scene="${id}"] [data-slot="${slot}"]`;

// The stage shot inside a box (stage px), as RGBA, after a page-side tweak; the tweak is undone by the next seek.
async function shot(o, t, box, tweak) {
  await o.mm.seek(t);
  if (tweak) await o.page.evaluate(tweak.fn, tweak.arg);
  const stage = await o.page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const clip = { x: stage.x + Math.max(0, box.x), y: stage.y + Math.max(0, box.y), width: Math.max(1, box.w), height: Math.max(1, box.h) };
  return decodePng(await o.page.screenshot({ type: 'png', clip, animations: 'disabled' }));
}
const hideGarden = { fn: (s) => { for (const g of document.querySelectorAll(`${s} svg.mm-garden`)) g.style.visibility = 'hidden'; }, arg: null };
// pixels farther than `d` (sum of channel differences) from the canvas colour
const inkMask = (img, canvas, d = 60) => { const m = new Uint8Array(img.width * img.height); for (let i = 0; i < m.length; i++) { const k = i * 4; m[i] = Math.abs(img.data[k] - canvas[0]) + Math.abs(img.data[k + 1] - canvas[1]) + Math.abs(img.data[k + 2] - canvas[2]) > d ? 1 : 0; } return m; };
const canvasOf = (o) => o.page.evaluate(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
const boxOf = (o, s) => o.page.evaluate((q) => { const st = document.querySelector('.mm-stage').getBoundingClientRect(), r = document.querySelector(q).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; }, s);

test('the front layer covers at most 8 % of the glyph ink at rest, on every kind, two brands, three formats', async () => {
  const worst = [];
  for (const brand of ['paper', 'nocturne']) for (const format of ['9x16', '1x1', '16x9']) {
    const o = await open(brand, format);
    try {
      const canvas = await canvasOf(o);
      for (const k of KINDS) {
        const t = await restOf(o, k), s = sel(k);
        const box = await boxOf(o, s);
        await o.mm.seek(t);
        const parts = await o.page.evaluate((q) => document.querySelectorAll(`${q} svg.mm-garden *`).length, s);
        assert.ok(parts > 5, `${brand} ${format} ${k}: the garden drew ${parts} parts`);
        const pad = { x: box.x - 20, y: box.y - 20, w: box.w + 40, h: box.h + 40 };
        // the glyph ink: the slot with its garden hidden
        const ink = inkMask(await shot(o, t, pad, { fn: hideGarden.fn, arg: s }), canvas);
        // the front layer alone: text transparent, back layer hidden
        const front = inkMask(await shot(o, t, pad, { fn: (q) => { const el = document.querySelector(q); el.style.color = 'transparent'; for (const g of el.querySelectorAll('svg.mm-garden--back')) g.style.visibility = 'hidden'; }, arg: s }), canvas, 30);
        let n = 0, both = 0;
        for (let i = 0; i < ink.length; i++) if (ink[i]) { n++; if (front[i]) both++; }
        assert.ok(n > 1000, `${brand} ${format} ${k}: the glyph ink was found (${n} px)`);
        const share = both / n;
        worst.push([share, `${brand} ${format} ${k}`]);
        assert.ok(share <= 0.08, `${brand} ${format} ${k}: front layer covers ${(share * 100).toFixed(2)} % of the ink`);
      }
    } finally { await o.close(); }
  }
  worst.sort((a, b) => b[0] - a[0]);
  console.log(`front cover, worst three: ${worst.slice(0, 3).map(([s, w]) => `${w} ${(s * 100).toFixed(2)} %`).join('; ')}`);
});

test('the ornament stays inside --mm-safe and off the line under the headline', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await open('paper', format);
    try {
      const canvas = await canvasOf(o);
      for (const k of KINDS) {
        const t = await settled(o, k);
        await o.mm.seek(t);
        const out = await o.page.evaluate((s) => {
          const st = document.querySelector('.mm-stage').getBoundingClientRect();
          const css = getComputedStyle(document.documentElement);
          const m = parseFloat(css.getPropertyValue('--mm-safe')), W = parseFloat(css.getPropertyValue('--mm-frame-w')), H = parseFloat(css.getPropertyValue('--mm-frame-h'));
          const bad = [];
          let n = 0;
          for (const e of document.querySelectorAll(`${s} svg.mm-garden > *`)) {
            const r = e.getBoundingClientRect(); n++;
            const x0 = r.left - st.left, y0 = r.top - st.top, x1 = r.right - st.left, y1 = r.bottom - st.top;
            if (x0 < m - 1 || y0 < m - 1 || x1 > W - m + 1 || y1 > H - m + 1) bad.push([x0, y0, x1, y1].map(Math.round));
          }
          return { n, bad, safe: m };
        }, sel(k));
        assert.ok(out.n > 5, `${format} ${k}: the garden drew ${out.n} parts`);
        assert.deepEqual(out.bad, [], `${format} ${k}: parts outside the safe margin ${out.safe}`);
        // no ornament pixel inside the sub's box: shoot it with every text transparent
        const sub = await boxOf(o, sel(k, 'sub'));
        const img = await shot(o, t, sub, { fn: () => { for (const e of document.querySelectorAll('.mm-stage *')) e.style.color = 'transparent'; }, arg: null });
        const lit = inkMask(img, canvas, 30).reduce((a, v) => a + v, 0);
        assert.equal(lit, 0, `${format} ${k}: ${lit} ornament px inside the sub's box`);
      }
    } finally { await o.close(); }
  }
});

test('every ornament colour is a palette role or an alpha of one', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const o = await open(brand, '9x16');
    try {
      for (const k of KINDS) {
        await o.mm.seek(await restOf(o, k));
        const r = await o.page.evaluate((s) => {
          const css = getComputedStyle(document.documentElement);
          const probe = document.createElement('i'); document.body.append(probe);
          const roles = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'].map((n) => { probe.style.color = css.getPropertyValue(`--mm-color-${n}`).trim(); return getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).join(','); });
          probe.remove();
          const off = new Set(); let n = 0;
          for (const e of document.querySelectorAll(`${s} svg.mm-garden *`)) {
            const cs = getComputedStyle(e);
            for (const v of [cs.fill, cs.stroke]) {
              if (!v || v === 'none') continue;
              const m = v.match(/[\d.]+/g); if (!m) { off.add(v); continue; }
              n++;
              const unit = v.startsWith('color(') ? 255 : 1;   // color(srgb r g b / a): channels in 0..1
              if (Number(m[3] ?? 1) === 0) continue;
              if (!roles.includes(m.slice(0, 3).map((c) => Math.round(Number(c) * unit)).join(','))) off.add(v);
            }
          }
          return { n, off: [...off] };
        }, sel(k));
        assert.ok(r.n > 5, `${brand} ${k}: colours read (${r.n})`);
        assert.deepEqual(r.off, [], `${brand} ${k}: colours that are not roles`);
      }
    } finally { await o.close(); }
  }
});

test('each kind draws its own parts: blossoms, traces with vias or pads, faceted shards', async () => {
  const o = await open('paper', '9x16');
  try {
    const parts = {};
    for (const k of KINDS) {
      await o.mm.seek(await restOf(o, k));
      parts[k] = await o.page.evaluate((s) => { const c = {}; for (const e of document.querySelectorAll(`${s} svg.mm-garden *`)) for (const n of e.classList) c[n] = (c[n] ?? 0) + 1; return c; }, sel(k));
    }
    assert.ok(parts.vines['mm-garden__stem'] >= 4 && parts.vines['mm-garden__leaf'] >= 2, JSON.stringify(parts.vines));
    assert.ok(parts.flowers['mm-garden__petal'] >= 10 && parts.flowers['mm-garden__heart'] >= 2, JSON.stringify(parts.flowers));
    assert.ok(parts.circuits['mm-garden__trace'] >= 4 && (parts.circuits['mm-garden__via'] ?? 0) + (parts.circuits['mm-garden__pad'] ?? 0) >= 3, JSON.stringify(parts.circuits));
    assert.ok(parts.crystals['mm-garden__facet'] >= 6 && parts.crystals['mm-garden__line'] >= 2, JSON.stringify(parts.crystals));
    assert.ok(!parts.circuits['mm-garden__petal'] && !parts.crystals['mm-garden__petal'], 'no blossoms on a circuit or a crystal');
  } finally { await o.close(); }
});

test('the type is exactly a plain entrance\'s type: the rest with its garden hidden matches entrances/fade', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await open('paper', format);
    try {
      const a = await boxOf(o, sel('vines')), b = await boxOf(o, sel('bare'));
      assert.deepEqual(a, b, 'same box');
      const one = await shot(o, await restOf(o, 'vines'), a, { fn: hideGarden.fn, arg: sel('vines') });
      const two = await shot(o, await restOf(o, 'bare'), b);
      assert.ok(Buffer.compare(Buffer.from(one.data), Buffer.from(two.data)) === 0, `${format}: the headline's pixels differ from a plain entrance`);
    } finally { await o.close(); }
  }
});

test('growth: nothing at the start, a part-grown garden mid-entrance, complete and still at rest', async () => {
  const o = await open('nocturne', '9x16');
  try {
    const it = await headline(o, 'vines');
    const count = async (t) => { await o.mm.seek(t); return o.page.evaluate((s) => document.querySelectorAll(`${s} svg.mm-garden *`).length, sel('vines')); };
    assert.equal(await count(it.start + 0.01 * it.d), 0, 'nothing has grown at 1 %');
    const mid = await count(it.start + 0.45 * it.d), rest = await count(it.start + it.d + 0.2);
    assert.ok(mid > 0 && mid < rest, `mid ${mid}, rest ${rest}`);
    const t = await settled(o, 'vines');
    const a = await framePng(o.page, t), b = await framePng(o.page, t + 0.6);
    assert.ok(Buffer.compare(a, b) === 0, 'the rest is still: two instants of the hold are the same picture');
  } finally { await o.close(); }
});

test('sway: breathe moves the ornament during the hold and never the text', async () => {
  const o = await open('paper', '9x16');
  try {
    const t = await settled(o, 'sway') - 0.4, s = sel('sway');
    const box = await boxOf(o, s);
    const pad = { x: box.x - 40, y: Math.max(0, box.y - 400), w: box.w + 80, h: box.h + 440 };
    const a = await shot(o, t + 0.4, pad), b = await shot(o, t + 0.9, pad);
    assert.ok(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) !== 0, 'the ornament moved');
    const ta = await shot(o, t + 0.4, pad, { fn: hideGarden.fn, arg: s }), tb = await shot(o, t + 0.9, pad, { fn: hideGarden.fn, arg: s });
    assert.ok(Buffer.compare(Buffer.from(ta.data), Buffer.from(tb.data)) === 0, 'the text did not');
  } finally { await o.close(); }
});

test('the same instants give the same pixels in forward and in reverse seek order', async () => {
  const o1 = await open('nocturne', '1x1'), o2 = await open('nocturne', '1x1');
  try {
    const ts = [];
    for (const k of KINDS) { const it = await headline(o1, k); ts.push(it.start + 0.35 * it.d, it.start + 0.7 * it.d, it.start + it.d + 0.2); }
    const fwd = []; for (const t of ts) fwd.push(await framePng(o1.page, t));
    const rev = []; for (const t of [...ts].reverse()) rev.unshift(await framePng(o2.page, t));
    assert.ok(Buffer.compare(fwd[0], fwd[2]) !== 0, 'the garden grows between the instants compared');
    ts.forEach((t, i) => assert.ok(Buffer.compare(fwd[i], rev[i]) === 0, `t = ${t.toFixed(3)} differs between the two orders`));
  } finally { await o1.close(); await o2.close(); }
});

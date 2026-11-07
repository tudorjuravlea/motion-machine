// text/garden kind botanical in the browser, on two brands of opposite polarity: with `bed: true`
// the flowers grow as a bed from below the headline toward its baseline and fill the lower frame
// while the type stays untouched and readable; on the letters (no bed) the illustrated blooms grow
// from the letterforms under the garden's budgets. Every rest passes the gate's palette test, frames
// are pure in t, the rest is still apart from the drifting petals (and fully still with
// `drift: settle`), and exits/wither recedes the bed to the bare slot.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng, offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'garden-botanical-test');
const LINE = 'Grow what lasts';
const beat = (fx, params = {}, extra = {}) => ({ at: 0.2, slot: 'headline', fx, text: LINE, params: { dur: 2.6, ...params }, ...extra });
const scene = (id, b, duration = 5) => ({ id, layout: 'layouts/statement', duration, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [b] });
const SCENES = [
  scene('hook', { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }, 3),
  scene('plain', beat('entrances/fade', {})),
  scene('bed', beat('text/garden', { kind: 'botanical', bed: true, seed: 1 })),
  scene('settle', beat('text/garden', { kind: 'botanical', bed: true, seed: 3, drift: 'settle' })),
  scene('letters', beat('text/garden', { kind: 'botanical', seed: 2 })),
  scene('wither', beat('text/garden', { kind: 'botanical', bed: true, seed: 2, exit: { type: 'keep' } }, { out: 3.4, exit: 'exits/wither' }), 5.5),
];
const story = { id: 'garden-botanical-test', kind: 'film', formats: ['16x9', '9x16'], title: 'garden botanical test', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, scenes: SCENES, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' } };

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const brand of ['paper', 'nocturne']) {
    const dir = join(OUT, brand), style = join(OUT, `${brand}.style.json`);
    rmSync(dir, { recursive: true, force: true });
    composeToFile({ brand, motion: 'calm', out: style });
    newPiece({ kind: 'film', style, dir });
    writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
    dirs[brand] = dir;
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (brand, format) => openPiece(dirs[brand], { server, browser, format });
const sel = (id) => `[data-scene="${id}"] [data-slot="headline"]`;
const itemOf = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
const restOf = async (o, id) => { const it = await itemOf(o, id); return it.start + it.d + 0.4; };
const frameOf = (o) => o.page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const boxOf = (o, s) => o.page.evaluate((q) => { const st = document.querySelector('.mm-stage').getBoundingClientRect(), r = document.querySelector(q).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; }, s);
const canvasOf = (o) => o.page.evaluate(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
const rolesOf = (o) => o.page.evaluate(() => ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'].map((n) => { const c = getComputedStyle(document.documentElement).getPropertyValue(`--mm-color-${n}`).trim(); const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }));
async function shot(o, t, tweak, clip = null) {
  await o.mm.seek(t);
  if (tweak) await o.page.evaluate(tweak.fn, tweak.arg);
  const f = await frameOf(o);
  const c = clip ? { x: f.x + Math.max(0, clip.x), y: f.y + Math.max(0, clip.y), width: Math.max(1, clip.w), height: Math.max(1, clip.h) } : { x: f.x, y: f.y, width: f.w, height: f.h };
  return decodePng(await o.page.screenshot({ type: 'png', clip: c, animations: 'disabled' }));
}
const noText = { fn: () => { for (const e of document.querySelectorAll('.mm-stage *')) e.style.color = 'transparent'; }, arg: null };
const hideGarden = (s) => ({ fn: (q) => { for (const g of document.querySelectorAll(`${q} svg.mm-garden`)) g.style.visibility = 'hidden'; }, arg: s });
const hidePetals = { fn: () => { for (const g of document.querySelectorAll('.mm-garden__b-drift')) g.style.visibility = 'hidden'; }, arg: null };
const inkShare = (img, canvas, r, d = 30) => {
  let n = 0, all = 0;
  for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(img.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(img.width, Math.ceil(r.x + r.w)); x++) {
    const k = (y * img.width + x) * 4; all++;
    if (Math.abs(img.data[k] - canvas[0]) + Math.abs(img.data[k + 1] - canvas[1]) + Math.abs(img.data[k + 2] - canvas[2]) > d) n++;
  }
  return all ? n / all : 0;
};

test('the bed grows under the headline and fills the lower frame, on two brands and two formats', async () => {
  const seen = [];
  for (const brand of ['paper', 'nocturne']) for (const format of ['16x9', '9x16']) {
    const o = await open(brand, format);
    try {
      const canvas = await canvasOf(o), f = await frameOf(o);
      for (const id of ['bed', 'settle']) {
        const t = await restOf(o, id), box = await boxOf(o, sel(id));
        const img = await shot(o, t, noText);
        const inBox = inkShare(img, canvas, box);
        const below = inkShare(img, canvas, { x: 0, y: box.y + box.h, w: f.w, h: f.h - box.y - box.h });
        const above = inkShare(img, canvas, { x: 0, y: 0, w: f.w, h: box.y });
        assert.ok(inBox <= 0.045, `${brand} ${format} ${id}: ornament covers ${(inBox * 100).toFixed(2)} % of the headline box`);
        assert.ok(below >= 0.3, `${brand} ${format} ${id}: the bed covers ${(below * 100).toFixed(1)} % of the frame under the headline`);
        assert.ok(above <= 0.02, `${brand} ${format} ${id}: ${(above * 100).toFixed(2)} % above the headline`);
        seen.push([inBox, below, above]);
      }
    } finally { await o.close(); }
  }
  console.log(`bed: in the box at most ${(Math.max(...seen.map((s) => s[0])) * 100).toFixed(2)} %, under the box at least ${(Math.min(...seen.map((s) => s[1])) * 100).toFixed(1)} %, above at most ${(Math.max(...seen.map((s) => s[2])) * 100).toFixed(2)} %`);
});

test('the type is untouched: the headline with its garden hidden is the plain headline, pixel for pixel', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open('paper', format);
    try {
      const b1 = await boxOf(o, sel('plain')), b2 = await boxOf(o, sel('bed'));
      assert.deepEqual(b2, b1, `${format}: the headline is laid out where the plain one is`);
      const pad = { x: b1.x - 10, y: b1.y - 10, w: b1.w + 20, h: b1.h + 20 };
      const plain = await shot(o, await restOf(o, 'plain'), null, pad);
      const bed = await shot(o, await restOf(o, 'bed'), hideGarden(sel('bed')), pad);
      assert.ok(Buffer.compare(Buffer.from(plain.data), Buffer.from(bed.data)) === 0, `${format}: the headline pixels differ`);
      const t = await o.page.evaluate((s) => { const el = document.querySelector(s); return { text: el.textContent.trim(), tf: getComputedStyle(el).transform }; }, sel('bed'));
      assert.equal(t.text, LINE);
      assert.equal(t.tf, 'none');
    } finally { await o.close(); }
  }
});

test('the front layer covers at most 8 % of the glyph ink at rest, bed and letters', async () => {
  for (const brand of ['paper', 'nocturne']) for (const format of ['16x9', '9x16']) {
    const o = await open(brand, format);
    try {
      const canvas = await canvasOf(o);
      for (const id of ['bed', 'letters']) {
        const t = await restOf(o, id), b = await boxOf(o, sel(id)), pad = { x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 };
        const ink = await shot(o, t, hideGarden(sel(id)), pad);
        const front = await shot(o, t, { fn: (q) => { const el = document.querySelector(q); el.style.color = 'transparent'; for (const g of el.querySelectorAll('svg.mm-garden--back')) g.style.visibility = 'hidden'; }, arg: sel(id) }, pad);
        let n = 0, both = 0;
        for (let i = 0; i < ink.width * ink.height; i++) {
          const k = i * 4, isInk = Math.abs(ink.data[k] - canvas[0]) + Math.abs(ink.data[k + 1] - canvas[1]) + Math.abs(ink.data[k + 2] - canvas[2]) > 60;
          if (!isInk) continue;
          n++;
          if (Math.abs(front.data[k] - canvas[0]) + Math.abs(front.data[k + 1] - canvas[1]) + Math.abs(front.data[k + 2] - canvas[2]) > 30) both++;
        }
        assert.ok(n > 1000, `${brand} ${format} ${id}: glyph ink found (${n})`);
        assert.ok(both / n <= 0.08, `${brand} ${format} ${id}: front layer covers ${((both / n) * 100).toFixed(2)} % of the ink`);
      }
    } finally { await o.close(); }
  }
});

test('every rest passes the gate\'s palette test: roles and blends of roles only', async () => {
  for (const brand of ['paper', 'nocturne']) for (const format of ['16x9', '9x16']) {
    const o = await open(brand, format);
    try {
      const dist = paletteDistance(await rolesOf(o));
      for (const id of ['bed', 'letters']) {
        const img = await shot(o, await restOf(o, id));
        const r = offPalette(img, dist, 2);
        const share = r.total ? r.all / r.total : 0;
        assert.ok(share <= 0.005, `${brand} ${format} ${id}: ${(share * 100).toFixed(3)} % of pixels off the palette`);
        assert.ok(r.largest.size <= 256, `${brand} ${format} ${id}: an off-palette region of ${r.largest.size} px`);
      }
    } finally { await o.close(); }
  }
});

test('the letters grow illustrated blooms and broad leaves under the garden\'s budgets', async () => {
  const o = await open('paper', '16x9');
  try {
    await o.mm.seek(await restOf(o, 'letters'));
    const m = await o.page.evaluate(async (s) => {
      const mod = await import(new URL('/patterns/text/garden/pattern.js', location.origin).href);
      const model = mod.modelOf(document.querySelector(s));
      return { forms: model.elements.filter((e) => e.type === 'bloom').map((e) => e.form), broad: model.elements.filter((e) => e.type === 'leaf' && e.shape === 'broad').length, boxShare: model.boxShare, front: model.front };
    }, sel('letters'));
    assert.ok(m.forms.length >= 2 && m.forms.every((f) => ['camellia', 'peony', 'lily', 'sweetpea'].includes(f)), `blooms ${m.forms.join(' ')}`);
    assert.ok(m.broad >= 2, `${m.broad} broad leaves`);
    assert.ok(m.boxShare <= 0.06 + 1e-9, `box share ${m.boxShare}`);
  } finally { await o.close(); }
});

test('growth: nothing at the start, part-grown mid-entrance, complete at rest; still with drift settle, only petals move with float', async () => {
  const o = await open('paper', '16x9');
  try {
    for (const id of ['bed', 'settle']) {
      const it = await itemOf(o, id);
      const count = async (t) => { await o.mm.seek(t); return o.page.evaluate((s) => document.querySelectorAll(`${s} svg.mm-garden *`).length, sel(id)); };
      assert.equal(await count(it.start + 0.01 * it.d), 0, `${id}: nothing at 1 %`);
      const mid = await count(it.start + 0.45 * it.d), rest = await count(it.start + it.d + 0.2);
      assert.ok(mid > 0 && mid < rest, `${id}: mid ${mid}, rest ${rest}`);
    }
    const t = await restOf(o, 'settle');
    assert.ok(Buffer.compare(await framePng(o.page, t), await framePng(o.page, t + 0.8)) === 0, 'drift settle: the rest is still');
    const u = await restOf(o, 'bed');
    const a = await shot(o, u), b = await shot(o, u + 0.8);
    assert.ok(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) !== 0, 'drift float: the petals move at rest');
    const c = await shot(o, u, hidePetals), d = await shot(o, u + 0.8, hidePetals);
    assert.ok(Buffer.compare(Buffer.from(c.data), Buffer.from(d.data)) === 0, 'drift float: everything but the petals is still');
  } finally { await o.close(); }
});

test('the same instants give the same pixels in forward and in reverse seek order', async () => {
  const o1 = await open('nocturne', '9x16'), o2 = await open('nocturne', '9x16');
  try {
    const ts = [];
    for (const id of ['bed', 'letters']) { const it = await itemOf(o1, id); ts.push(it.start + 0.35 * it.d, it.start + 0.7 * it.d, it.start + it.d + 0.6); }
    const fwd = []; for (const t of ts) fwd.push(await framePng(o1.page, t));
    const rev = []; for (const t of [...ts].reverse()) rev.unshift(await framePng(o2.page, t));
    ts.forEach((t, i) => assert.ok(Buffer.compare(fwd[i], rev[i]) === 0, `t = ${t.toFixed(3)} differs between the two orders`));
  } finally { await o1.close(); await o2.close(); }
});

test('exits/wither recedes the bed to the bare slot', async () => {
  const o = await open('paper', '16x9');
  try {
    const it = await itemOf(o, 'wither');
    assert.ok(it.exit && it.exit.d > 0, 'the beat has an exit');
    const parts = async (t) => { await o.mm.seek(t); return o.page.evaluate((s) => document.querySelectorAll(`${s} svg.mm-garden *`).length, sel('wither')); };
    const full = await parts(it.start + it.d + 0.2);
    const seen = [];
    for (const f of [0.2, 0.45, 0.7, 0.9]) seen.push(await parts(it.exit.start + f * it.exit.d));
    assert.ok(full > 50 && seen[2] < full && seen[3] < seen[0], `recedes ${full} → ${seen.join(', ')}`);
    const f = await frameOf(o), all = { x: 0, y: 0, w: f.w, h: f.h };
    const bare = await shot(o, it.start + it.d + 0.2, { fn: () => { for (const g of document.querySelectorAll('svg.mm-garden')) g.style.visibility = 'hidden'; }, arg: null }, all);
    const last = await shot(o, it.exit.start + it.exit.d - 1 / 30, null, all);
    assert.ok(Buffer.compare(Buffer.from(last.data), Buffer.from(bare.data)) === 0, 'the last frame of the exit is the bare slot');
  } finally { await o.close(); }
});

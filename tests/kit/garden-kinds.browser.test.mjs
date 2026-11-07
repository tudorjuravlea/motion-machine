// text/garden's organic kinds beyond vines and flowers (leaves, ferns, branches, roots, coral,
// seaweed, moss, grass, and mix): each draws its own parts where its stem type roots, and every one
// keeps the garden's budgets and laws on two brands of opposite polarity: the front layer covers at
// most 8 % of the glyph ink, ornament inside the headline's box stays under 6 %, ornament stays in
// --mm-safe and off the line under the headline, colours are roles, nothing has grown at the start,
// the rest is still, frames are the same in forward and reverse seek order, and no seed is bare.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'garden-kinds-test');
const TEXT = { leaves: 'Evergreen', ferns: 'Unfold gently', branches: 'First blossom', roots: 'Deep roots', coral: 'Reef life', seaweed: 'Ocean calm', moss: 'Soft ground', grass: 'Open fields', mix: 'Wild garden' };
const KINDS = Object.keys(TEXT);
const SEEDS = [1, 2, 3, 4, 5, 6];
const scene = (id, text, params) => ({
  id, layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.2, slot: 'headline', fx: 'text/garden', text, params: { dur: 2.4, ...params } },
    { at: 2.8, slot: 'sub', fx: 'entrances/fade', text: 'A line under the headline.' },
  ],
});
// the hook scene comes first (its headline is a step larger), so every compared scene is a later one
const SCENES = [
  { ...scene('hook', 'Hook', {}), beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }] },
  ...KINDS.map((k) => scene(k, TEXT[k], { kind: k, seed: 2 })),
  ...KINDS.flatMap((k) => SEEDS.map((s) => scene(`seed-${k}-${s}`, TEXT[k], { kind: k, seed: s }))),
];
const story = { id: 'garden-kinds-test', kind: 'film', formats: ['16x9', '9x16', '1x1'], title: 'garden kinds test', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, scenes: SCENES, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' } };

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
const sel = (id, slot = 'headline') => `[data-scene="${id}"] [data-slot="${slot}"]`;
const headline = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
const restOf = async (o, id) => { const it = await headline(o, id); return it.start + it.d + 0.3; };
const settled = async (o, id) => { const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === id && !x.parent && x.beat?.slot === 'sub'); return it.start + it.d + 0.05; };
async function shot(o, t, box, tweak) {
  await o.mm.seek(t);
  if (tweak) await o.page.evaluate(tweak.fn, tweak.arg);
  const stage = await o.page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const clip = { x: stage.x + Math.max(0, box.x), y: stage.y + Math.max(0, box.y), width: Math.max(1, box.w), height: Math.max(1, box.h) };
  return decodePng(await o.page.screenshot({ type: 'png', clip, animations: 'disabled' }));
}
const hideGarden = (s) => { for (const g of document.querySelectorAll(`${s} svg.mm-garden`)) g.style.visibility = 'hidden'; };
const inkMask = (img, canvas, d = 60) => { const m = new Uint8Array(img.width * img.height); for (let i = 0; i < m.length; i++) { const k = i * 4; m[i] = Math.abs(img.data[k] - canvas[0]) + Math.abs(img.data[k + 1] - canvas[1]) + Math.abs(img.data[k + 2] - canvas[2]) > d ? 1 : 0; } return m; };
const canvasOf = (o) => o.page.evaluate(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
const boxOf = (o, s) => o.page.evaluate((q) => { const st = document.querySelector('.mm-stage').getBoundingClientRect(), r = document.querySelector(q).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; }, s);
// the plan behind a slot, read through the pattern's own module: what each kind is made of
const summary = (o, id) => o.page.evaluate(async (s) => {
  const mod = await import(new URL('/patterns/text/garden/pattern.js', location.origin).href);
  const el = document.querySelector(s), m = mod.modelOf(el);
  if (!m) return null;
  const em = m.em, base = Math.max(...m.letters.map((l) => l.base)), top = Math.min(...m.letters.map((l) => l.base)) - em * 0.8;
  const E = m.elements, stems = E.filter((e) => e.pts && e.type !== 'line');
  const c = {};
  for (const e of E) { const k = e.type + (e.shape ? `:${e.shape}` : '') + (e.form ? `:${e.form}` : '') + (e.profile ? `:${e.profile}` : ''); c[k] = (c[k] ?? 0) + 1; }
  return {
    count: c, sets: m.sets.map((x) => x.kind), boxShare: m.boxShare, plants: new Set(E.filter((e) => !e.bridge).map((e) => e.id)).size,
    curls: stems.filter((e) => e.curl).length,
    hanging: stems.filter((e) => e.pts.at(-1)[1] > base + em * 0.12).length,
    climbing: stems.filter((e) => e.type === 'stem' && !e.profile && Math.min(...e.pts.map((p) => p[1])) < top).length,
    tall: E.filter((e) => e.profile === 'kelp' && e.root - Math.min(...e.pts.map((p) => p[1])) > em * 0.8).length,
    onBaseline: E.filter((e) => e.profile === 'blade' && Math.abs(e.pts[0][1] - base) < em * 0.05).length,
    dotsOnEdges: E.filter((e) => e.type === 'dot' && m.inkAt(e.x, e.y) * em < e.r + em * 0.08).length,
    grains: E.filter((e) => e.form === 'spore' && e.grains > 1).length,
    capsules: E.filter((e) => e.form === 'spore' && e.grains === 1).length,
    caps: el.querySelectorAll('svg.mm-garden circle.mm-garden__stem').length,
  };
}, sel(id));

test('each new kind draws its own parts where its stem type roots', async () => {
  const o = await open('paper', '16x9');
  try {
    const m = {};
    for (const k of KINDS) { await o.mm.seek(await settled(o, k)); m[k] = await summary(o, k); }
    const n = (k, key) => m[k].count[key] ?? 0;
    assert.ok(n('leaves', 'leaf:heart') >= 8, `leaves: heart leaves ${JSON.stringify(m.leaves.count)}`);
    assert.ok(n('ferns', 'leaf:leaflet') >= 40 && m.ferns.curls >= 2, `ferns: leaflets and fiddleheads ${JSON.stringify(m.ferns)}`);
    assert.ok(n('branches', 'bloom') >= 4 && n('branches', 'bud') >= 2, `branches: blossoms and buds ${JSON.stringify(m.branches.count)}`);
    assert.ok(m.roots.hanging >= 4 && m.roots.climbing === 0 && n('roots', 'line') >= 4, `roots: hanging threads with hairs ${JSON.stringify(m.roots)}`);
    assert.ok(n('coral', 'stem:club') >= 5 && m.coral.caps >= 3, `coral: club limbs with round tips ${JSON.stringify(m.coral)}`);
    assert.ok(m.seaweed.tall >= 3, `seaweed: tall kelp ${JSON.stringify(m.seaweed)}`);
    assert.ok(n('moss', 'dot') >= 20 && m.moss.dotsOnEdges >= n('moss', 'dot') * 0.9 && m.moss.capsules >= 2 && n('moss', 'tuft:lance') >= 3, `moss: cushions on the edges ${JSON.stringify(m.moss)}`);
    assert.ok(m.grass.onBaseline >= 10 && m.grass.grains >= 2, `grass: blades on the baseline and seed heads ${JSON.stringify(m.grass)}`);
    assert.ok(m.mix.sets.length >= 2 && m.mix.plants >= 3, `mix: ${JSON.stringify(m.mix)}`);
    const blooms = (k) => Object.entries(m[k].count).filter(([key]) => key.startsWith('bloom')).reduce((x, [, v]) => x + v, 0);
    for (const k of ['leaves', 'ferns', 'roots', 'coral', 'seaweed']) assert.equal(blooms(k), 0, `${k} opens no bloom`);
  } finally { await o.close(); }
});

test('the front layer covers at most 8 % of the glyph ink at rest, on every new kind, two brands, two formats', async () => {
  const worst = [];
  for (const brand of ['paper', 'nocturne']) for (const format of ['16x9', '9x16']) {
    const o = await open(brand, format);
    try {
      const canvas = await canvasOf(o);
      for (const k of KINDS) {
        const t = await restOf(o, k), s = sel(k), box = await boxOf(o, s);
        const pad = { x: box.x - 20, y: box.y - 20, w: box.w + 40, h: box.h + 40 };
        const ink = inkMask(await shot(o, t, pad, { fn: hideGarden, arg: s }), canvas);
        const front = inkMask(await shot(o, t, pad, { fn: (q) => { const el = document.querySelector(q); el.style.color = 'transparent'; for (const g of el.querySelectorAll('svg.mm-garden--back')) g.style.visibility = 'hidden'; }, arg: s }), canvas, 30);
        let n = 0, both = 0;
        for (let i = 0; i < ink.length; i++) if (ink[i]) { n++; if (front[i]) both++; }
        assert.ok(n > 1000, `${brand} ${format} ${k}: the glyph ink was found (${n} px)`);
        worst.push([both / n, `${brand} ${format} ${k}`]);
        assert.ok(both / n <= 0.08, `${brand} ${format} ${k}: front layer covers ${((both / n) * 100).toFixed(2)} % of the ink`);
      }
    } finally { await o.close(); }
  }
  worst.sort((a, b) => b[0] - a[0]);
  console.log(`front cover, worst three: ${worst.slice(0, 3).map(([s, w]) => `${w} ${(s * 100).toFixed(2)} %`).join('; ')}`);
});

test('ornament inside the headline\'s own box stays under 6 % of the box, every new kind and seed', async () => {
  const o = await open('paper', '16x9');
  try {
    const shares = [];
    for (const k of KINDS) for (const id of [k, ...SEEDS.map((s) => `seed-${k}-${s}`)]) { await o.mm.seek(await settled(o, id)); shares.push((await summary(o, id)).boxShare); }
    console.log(`box share: max ${(Math.max(...shares) * 100).toFixed(2)} %`);
    assert.ok(Math.max(...shares) <= 0.06 + 1e-9, `max ${Math.max(...shares)}`);
  } finally { await o.close(); }
});

test('the ornament stays inside --mm-safe and off the line under the headline', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open('paper', format);
    try {
      const canvas = await canvasOf(o);
      for (const k of KINDS) {
        const t = await settled(o, k);
        await o.mm.seek(t);
        const out = await o.page.evaluate((s) => {
          const st = document.querySelector('.mm-stage').getBoundingClientRect(), css = getComputedStyle(document.documentElement);
          const m = parseFloat(css.getPropertyValue('--mm-safe')), W = parseFloat(css.getPropertyValue('--mm-frame-w')), H = parseFloat(css.getPropertyValue('--mm-frame-h'));
          const bad = []; let n = 0;
          for (const e of document.querySelectorAll(`${s} svg.mm-garden > *`)) {
            const r = e.getBoundingClientRect(); n++;
            const x0 = r.left - st.left, y0 = r.top - st.top, x1 = r.right - st.left, y1 = r.bottom - st.top;
            if (x0 < m - 1 || y0 < m - 1 || x1 > W - m + 1 || y1 > H - m + 1) bad.push([x0, y0, x1, y1].map(Math.round));
          }
          return { n, bad };
        }, sel(k));
        assert.ok(out.n > 5, `${format} ${k}: the garden drew ${out.n} parts`);
        assert.deepEqual(out.bad, [], `${format} ${k}: parts outside the safe margin`);
        const img = await shot(o, t, await boxOf(o, sel(k, 'sub')), { fn: () => { for (const e of document.querySelectorAll('.mm-stage *')) e.style.color = 'transparent'; }, arg: null });
        assert.equal(inkMask(img, canvas, 30).reduce((a, v) => a + v, 0), 0, `${format} ${k}: ornament inside the sub's box`);
      }
    } finally { await o.close(); }
  }
});

test('every ornament colour is a palette role or an alpha of one', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const o = await open(brand, '16x9');
    try {
      for (const k of KINDS) {
        await o.mm.seek(await restOf(o, k));
        const r = await o.page.evaluate((s) => {
          const css = getComputedStyle(document.documentElement), probe = document.createElement('i'); document.body.append(probe);
          const roles = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'].map((n) => { probe.style.color = css.getPropertyValue(`--mm-color-${n}`).trim(); return getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).join(','); });
          probe.remove();
          const off = new Set(); let n = 0;
          for (const e of document.querySelectorAll(`${s} svg.mm-garden *`)) {
            const cs = getComputedStyle(e);
            for (const v of [cs.fill, cs.stroke]) {
              if (!v || v === 'none') continue;
              const m = v.match(/[\d.]+/g); if (!m) { off.add(v); continue; }
              n++;
              const unit = v.startsWith('color(') ? 255 : 1;
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

test('growth: nothing at the start, part-grown mid-entrance, complete and still at rest', async () => {
  const o = await open('nocturne', '16x9');
  try {
    for (const k of KINDS) {
      const it = await headline(o, k);
      const count = async (t) => { await o.mm.seek(t); return o.page.evaluate((s) => document.querySelectorAll(`${s} svg.mm-garden *`).length, sel(k)); };
      assert.equal(await count(it.start + 0.01 * it.d), 0, `${k}: nothing has grown at 1 %`);
      const mid = await count(it.start + 0.45 * it.d), rest = await count(it.start + it.d + 0.2);
      assert.ok(mid > 0 && mid < rest, `${k}: mid ${mid}, rest ${rest}`);
      const t = await settled(o, k);
      assert.ok(Buffer.compare(await framePng(o.page, t), await framePng(o.page, t + 0.6)) === 0, `${k}: the rest is still`);
    }
  } finally { await o.close(); }
});

test('the same instants give the same pixels in forward and in reverse seek order', async () => {
  const o1 = await open('nocturne', '1x1'), o2 = await open('nocturne', '1x1');
  try {
    const ts = [];
    for (const k of KINDS) { const it = await headline(o1, k); ts.push(it.start + 0.35 * it.d, it.start + 0.7 * it.d, it.start + it.d + 0.2); }
    const fwd = []; for (const t of ts) fwd.push(await framePng(o1.page, t));
    const rev = []; for (const t of [...ts].reverse()) rev.unshift(await framePng(o2.page, t));
    ts.forEach((t, i) => assert.ok(Buffer.compare(fwd[i], rev[i]) === 0, `t = ${t.toFixed(3)} differs between the two orders`));
  } finally { await o1.close(); await o2.close(); }
});

test('no seed is bare: seeds 1 to 6 of every new kind grow three plants or more', async () => {
  const o = await open('paper', '16x9');
  try {
    const low = [];
    for (const k of KINDS) for (const s of SEEDS) {
      const id = `seed-${k}-${s}`;
      await o.mm.seek(await settled(o, id));
      const m = await summary(o, id);
      low.push([m.plants, id]);
      assert.ok(m.plants >= 3, `${id}: ${m.plants} plants`);
    }
    low.sort((a, b) => a[0] - b[0]);
    console.log(`fewest plants: ${low.slice(0, 3).map(([n, id]) => `${id} ${n}`).join('; ')}`);
  } finally { await o.close(); }
});

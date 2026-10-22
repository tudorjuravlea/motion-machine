// text/garden grows a garden worth a film opener: the demo's lines carry about twice the ornament a
// 2.5 % text box budget lets through, the box budget is 6 %, density really adds growth, a single
// letter still grows, no seed of the demo's lines is bare, a slot that grows too little says so in
// mm.warnings, and vines and flowers are chains of Bézier segments with one level of offshoots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'garden-growth-test');
const DEMO = JSON.parse(readFileSync(join(ROOT, 'patterns/text/garden/demo/story.json'), 'utf8'));
// the four kinds whose floors this file measures; the organic kinds have garden-kinds.browser.test.mjs
const LINES = DEMO.scenes.filter((s) => ['flowers', 'vines', 'circuits', 'crystals'].includes(s.beats[0].params.kind)).map((s) => ({ id: s.id, text: s.beats[0].text, params: s.beats[0].params }));
const scene = (id, text, params = {}) => ({
  id, layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.2, slot: 'headline', fx: 'text/garden', text, params: { dur: 2.4, ...params } },
    { at: 2.8, slot: 'sub', fx: 'entrances/fade', text: 'A line under the headline.' },
  ],
});
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SCENES = [
  { ...scene('hook', 'Hook'), beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }] },
  ...LINES.map((l) => scene(`demo-${l.id}`, l.text, l.params)),
  ...LINES.flatMap((l) => SEEDS.map((s) => scene(`seed-${l.id}-${s}`, l.text, { ...l.params, seed: s }))),
  ...['vines', 'flowers'].flatMap((k) => [1, 2, 3, 4, 5, 6].flatMap((s) => [1, 1.6].map((d) => scene(`dens-${k}-${s}-${d}`, LINES.find((l) => l.params.kind === k).text, { kind: k, seed: s, density: d })))),
  ...['A', 'I'].flatMap((ch) => ['flowers', 'vines'].flatMap((k) => [1, 2, 3, 4, 5].map((s) => scene(`one-${ch}-${k}-${s}`, ch, { kind: k, seed: s })))),
  scene('dot', '.', { kind: 'flowers', seed: 1, density: 0.5 }),
];
const story = { id: 'garden-growth-test', kind: 'film', formats: ['16x9', '9x16', '1x1'], title: 'garden growth test', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, scenes: SCENES, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' } };

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
const settled = async (o, id) => { const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === id && !x.parent && x.beat?.slot === 'sub'); return it.start + it.d + 0.05; };
// ornament pixels of a scene's settled frame as a share of the frame (every text transparent)
async function coverage(o, id) {
  await o.mm.seek(await settled(o, id));
  await o.page.evaluate((s) => { for (const e of document.querySelectorAll(`${s} [data-slot]`)) e.style.color = 'transparent'; }, `[data-scene="${id}"]`);
  const img = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled' }));
  const bg = await o.page.evaluate(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) { const k = i * 4; if (Math.abs(img.data[k] - bg[0]) + Math.abs(img.data[k + 1] - bg[1]) + Math.abs(img.data[k + 2] - bg[2]) > 40) n++; }
  return n / (img.width * img.height);
}
// the plan behind a slot, read through the pattern's own module
const modelSummary = (o, id) => o.page.evaluate(async (s) => {
  const mod = await import(new URL('/patterns/text/garden/pattern.js', location.origin).href);
  const m = mod.modelOf(document.querySelector(s));
  if (!m) return null;
  const stems = m.elements.filter((e) => e.pts && !e.bridge);
  return {
    boxShare: m.boxShare, stems: m.elements.filter((e) => e.pts).length,
    ends: m.elements.filter((e) => ['bloom', 'bud', 'leaf', 'via', 'pad', 'shard'].includes(e.type)).length + stems.filter((e) => e.curl).length,
    chains: stems.filter((e) => e.segs).map((e) => ({ segs: e.segs.length, child: !!e.parent, parentIsChild: !!e.parent?.parent })),
  };
}, sel(id));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// floors at 1.9 times what the demo grows on this harness under a 2.5 % box budget (paper 0.36 %, nocturne 0.55 %)
const FLOOR = { paper: 0.0068, nocturne: 0.0105 };
test('the demo grows about twice the ornament a 2.5 % box budget lets through, on paper and nocturne', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const o = await open(brand, '16x9');
    try {
      const cov = [];
      for (const l of LINES) cov.push(await coverage(o, `demo-${l.id}`));
      console.log(`${brand} 16x9 demo coverage: ${cov.map((c) => (c * 100).toFixed(2)).join(', ')} %; mean ${(mean(cov) * 100).toFixed(3)} %`);
      assert.ok(mean(cov) >= FLOOR[brand], `${brand}: mean ${(mean(cov) * 100).toFixed(3)} %, floor ${(FLOOR[brand] * 100).toFixed(2)} %`);
    } finally { await o.close(); }
  }
});

test('the ornament inside the headline\'s own box may reach 6 % of the box and never more', async () => {
  const o = await open('paper', '16x9');
  try {
    const shares = [];
    for (const l of LINES) { await o.mm.seek(await settled(o, `demo-${l.id}`)); shares.push((await modelSummary(o, `demo-${l.id}`)).boxShare); }
    for (const l of LINES) for (const s of SEEDS) { await o.mm.seek(await settled(o, `seed-${l.id}-${s}`)); shares.push((await modelSummary(o, `seed-${l.id}-${s}`)).boxShare); }
    console.log(`box share: max ${(Math.max(...shares) * 100).toFixed(2)} %, mean ${(mean(shares) * 100).toFixed(2)} %`);
    assert.ok(Math.max(...shares) <= 0.06 + 1e-9, `max ${Math.max(...shares)}`);
    assert.ok(Math.max(...shares) > 0.025, 'the budget lets more than 2.5 % through somewhere');
  } finally { await o.close(); }
});

test('density really adds growth: 1.6 grows at least 1.3 times what 1 grows on average, and never less, over six seeds', async () => {
  const o = await open('paper', '16x9');
  try {
    for (const k of ['vines', 'flowers']) {
      const r = [];
      for (const s of [1, 2, 3, 4, 5, 6]) {
        const lo = await coverage(o, `dens-${k}-${s}-1`), hi = await coverage(o, `dens-${k}-${s}-1.6`);
        r.push(hi / lo);
        assert.ok(hi >= lo, `${k} seed ${s}: ${(hi * 100).toFixed(3)} % at 1.6 < ${(lo * 100).toFixed(3)} % at 1`);
      }
      console.log(`${k} density 1.6 / 1: ${r.map((x) => x.toFixed(2)).join(', ')}`);
      assert.ok(mean(r) >= 1.3, `${k}: mean ratio ${mean(r).toFixed(2)}`);
    }
  } finally { await o.close(); }
});

test('a one-letter headline still grows: "A" and "I" get a stem and an end on every seed', async () => {
  const o = await open('paper', '16x9');
  try {
    for (const ch of ['A', 'I']) for (const k of ['flowers', 'vines']) for (const s of [1, 2, 3, 4, 5]) {
      const id = `one-${ch}-${k}-${s}`;
      await o.mm.seek(await settled(o, id));
      const m = await modelSummary(o, id);
      assert.ok(m.stems >= 1 && m.ends >= 1, `${id}: ${JSON.stringify(m)}`);
    }
  } finally { await o.close(); }
});

test('no seed of the demo\'s lines is bare: seeds 1 to 10 grow three stems or more and at least 0.3 % of the frame', async () => {
  const o = await open('paper', '16x9');
  try {
    const low = [];
    for (const l of LINES) for (const s of SEEDS) {
      const id = `seed-${l.id}-${s}`;
      const c = await coverage(o, id), m = await modelSummary(o, id);
      low.push([c, id]);
      assert.ok(m.stems >= 3 && c >= 0.003, `${id}: ${m.stems} stems, ${(c * 100).toFixed(3)} %`);
    }
    low.sort((a, b) => a[0] - b[0]);
    console.log(`sparsest seeds: ${low.slice(0, 3).map(([c, id]) => `${id} ${(c * 100).toFixed(2)} %`).join('; ')}`);
  } finally { await o.close(); }
});

test('a slot that grows almost nothing names itself in mm.warnings', async () => {
  const o = await open('paper', '16x9');
  try {
    await o.mm.seek(await settled(o, 'dot'));
    const w = await o.page.evaluate(() => window.mm.warnings);
    assert.ok(w.some((x) => x.startsWith('text/garden: [data-scene="dot"] [data-slot="headline"]')), JSON.stringify(w));
    await o.mm.seek(await settled(o, 'demo-vines'));
    const w2 = await o.page.evaluate(() => window.mm.warnings);
    assert.ok(!w2.some((x) => x.includes('demo-vines')), 'a full garden raises no warning');
  } finally { await o.close(); }
});

test('vines and flowers grow chains of Bézier segments: main stems up to 6, offshoots up to 3, offshoots never branch', async () => {
  const o = await open('paper', '9x16');
  try {
    for (const id of ['demo-vines', 'demo-flowers']) {
      await o.mm.seek(await settled(o, id));
      const m = await modelSummary(o, id);
      assert.ok(m.chains.length >= 3, `${id}: ${m.chains.length} chains`);
      for (const c of m.chains) {
        assert.ok(c.segs >= 1 && c.segs <= (c.child ? 3 : 6), `${id}: ${JSON.stringify(c)}`);
        assert.equal(c.parentIsChild, false);
      }
      assert.ok(m.chains.some((c) => c.child), `${id}: some offshoot grows`);
    }
  } finally { await o.close(); }
});

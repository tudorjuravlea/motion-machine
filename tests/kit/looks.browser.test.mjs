// The look presets on a demo piece: spot-mono, print-plates and blueprint each scaffold a film
// that passes the gate's hard rules for brand, determinism, rests and legibility (G-BRAND 0 % off the
// palette with the finish drawn). Each look has its own demo story: spot-mono's puts its payoff figure
// in each scene, blueprint's marks its figure with dimension lines. spot-mono keeps the accent a spot
// on one subject: at every rest exactly one text takes the accent, the accent shows as at least one
// solid region, and it covers a small share of the frame over its neutral system.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { hexToRgb } from '../../scripts/check/_lib.mjs';
import { decodePng, rgbToLab, deltaE, countPixels } from '../../scripts/check/_pixels.mjs';

const beat = (at, slot, fx, text, extra = {}) => ({ at, slot, fx, text, ...extra });
const STORY = {
  id: 'looks-demo', kind: 'film', formats: ['16x9'], title: 'A look worn by a brand', language: 'en',
  facts: [{ id: 'f1', text: 'Forty minutes is an invented figure for this demo.', source: 'demo copy, invented' }],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'hook', layout: 'layouts/statement', duration: 4, position: 'opening', move: null, say: '',
      beats: [beat(0, 'headline', 'style:headline', 'One colour carries the story', { params: { instant: true } }), beat(0.8, 'sub', 'style:body', 'Everything else stays quiet.')] },
    { id: 'change', layout: 'layouts/comparison', duration: 4.4, position: 'topic', move: null, say: '',
      beats: [beat(0.45, 'headline', 'style:headline', 'Before and after'), beat(0.9, 'left', 'style:plate', 'Six steps'), beat(1.3, 'right', 'style:plate', 'Two steps')] },
    { id: 'quiet', layout: 'layouts/statement', duration: 4.6, position: 'related', move: null, say: '',
      beats: [beat(0.3, 'headline', 'style:headline', 'Greys hold the rest'), beat(1.1, 'sub', 'style:body', 'So the one colour reads first.')] },
    { id: 'figure', layout: 'layouts/stat-hero', duration: 5, position: 'climax', move: null, say: '',
      beats: [beat(0.35, 'headline', 'style:headline', 'minutes back each week'), beat(0.75, 'figure', 'style:figure', '40', { value: 40, fact: 'f1', emphasis: 'emphasis/marker-circle' }), beat(1.3, 'body', 'style:body', 'for every person on the team')] },
    { id: 'end', layout: 'layouts/endcard', duration: 4, position: 'outro', move: null, say: '',
      beats: [beat(0.3, 'headline', 'style:headline', 'Two inks. One story.'), beat(1.1, 'line', 'style:body', 'Make the next one yours')] },
  ],
  cta: { text: 'Make the next one yours', url: '' },
};
// spot-mono: every scene's payoff is a figure, and the figure is the one subject in the accent
const SPOT = {
  ...STORY,
  scenes: [
    { id: 'hook', layout: 'layouts/split', duration: 4, position: 'opening', move: null, say: '',
      beats: [beat(0, 'headline', 'style:headline', 'colour carries the story', { params: { instant: true } }), beat(0.4, 'figure', 'style:figure', '1'), beat(0.9, 'body', 'style:body', 'Everything else stays quiet.')] },
    { id: 'change', layout: 'layouts/split', duration: 4.4, position: 'topic', move: null, say: '',
      beats: [beat(0.45, 'headline', 'style:headline', 'steps to publish'), beat(0.9, 'figure', 'style:figure', '2'), beat(1.3, 'caption', 'style:body', 'Down from six.')] },
    { id: 'quiet', layout: 'layouts/split', duration: 4.6, position: 'related', move: null, say: '',
      beats: [beat(0.3, 'headline', 'style:headline', 'Greys hold the rest'), beat(0.7, 'figure', 'style:figure', 'Most'), beat(1.1, 'body', 'style:body', 'of every frame stays neutral.')] },
    STORY.scenes[3],
    { id: 'end', layout: 'layouts/split', duration: 4, position: 'outro', move: null, say: '',
      beats: [beat(0.3, 'headline', 'style:headline', 'inks, one story'), beat(0.7, 'figure', 'style:figure', 'Two'), beat(1.1, 'body', 'style:body', 'Make the next one yours')] },
  ],
};
// blueprint: the figure is dimensioned like a drawing
const DRAWN = { ...STORY, scenes: STORY.scenes.map((sc) => (sc.id !== 'figure' ? sc : { ...sc, beats: sc.beats.map((b) => (b.slot === 'figure' ? { ...b, emphasis: 'emphasis/dimension' } : b)) })) };
const STORIES = { 'spot-mono': SPOT, 'print-plates': STORY, blueprint: DRAWN };
const LOOKS = ['spot-mono', 'print-plates', 'blueprint'];
const HARD = ['G-BRAND', 'G-DETERMINISM', 'G-REST', 'G-LEGIBLE'];
const BASE = join(ROOT, 'pieces', `.tmp-looks-${process.pid}`);
const dirs = {};
// a ground mark the style names by its repo path travels into the piece beside the fonts, the way
// `mm new` copies font files (SPEC §8)
function carryMark(dir) {
  const st = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  const src = st.ground?.mark?.src;
  if (!src?.startsWith('styles/')) return;
  const rel = `assets/ground/${basename(src)}`;
  mkdirSync(join(dir, 'assets/ground'), { recursive: true });
  copyFileSync(join(ROOT, src), join(dir, rel));
  st.ground.mark.src = rel;
  writeFileSync(join(dir, 'style.json'), JSON.stringify(st, null, 2) + '\n');
}
let server, browser;
before(async () => {
  mkdirSync(BASE, { recursive: true });
  for (const look of LOOKS) {
    dirs[look] = join(BASE, look);
    newPiece({ kind: 'film', style: look, id: 'looks-demo', dir: dirs[look] });
    writeFileSync(join(dirs[look], 'story.json'), JSON.stringify(STORIES[look], null, 2));
    carryMark(dirs[look]);
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(BASE, { recursive: true, force: true }); });

for (const look of LOOKS) {
  test(`${look}: the demo passes the hard rules for brand, determinism, rests and legibility`, async () => {
    const res = await runCheck(dirs[look], { browser, server, only: HARD });
    const fails = res.rules.filter((r) => r.status === 'FAIL').map((r) => `${r.id}: ${r.evidence?.reason}`);
    assert.deepEqual(fails, []);
    const brand = res.rules.find((r) => r.id === 'G-BRAND');
    assert.equal(brand.status, 'PASS', JSON.stringify(brand.evidence));
    assert.match(String(brand.evidence?.measured), /^0 %/);
  });
}

// the largest 4-connected region of pixels that pass `hit`, on a grid of every `step`-th pixel, in pixels
function largestRegion(img, hit, step = 2) {
  const W = Math.ceil(img.width / step), H = Math.ceil(img.height / step), on = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * step * img.width + x * step) * 4; on[y * W + x] = hit(img.data[o], img.data[o + 1], img.data[o + 2]) ? 1 : 0; }
  let best = 0;
  const stack = [];
  for (let i = 0; i < on.length; i++) {
    if (on[i] !== 1) continue;
    let n = 0; on[i] = 2; stack.push(i);
    while (stack.length) {
      const j = stack.pop(); n++;
      const x = j % W, y = (j - x) / W;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (k >= 0 && on[k] === 1) { on[k] = 2; stack.push(k); }
    }
    best = Math.max(best, n);
  }
  return best * step * step;
}

test('spot-mono: at every rest exactly one subject takes the accent, a solid spot over the greys', async () => {
  const o = await openPiece(dirs['spot-mono'], { server, browser });
  try {
    const { holds } = (await o.mm.meta()).schedule;
    assert.equal(holds.length, SPOT.scenes.length);
    const accent = await o.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mm-color-accent').trim());
    const lab = rgbToLab(...hexToRgb(accent));
    const isAccent = (r, g, b) => deltaE(rgbToLab(r, g, b), lab) < 10;
    const rows = [];
    for (const h of holds) {
      await o.mm.seek(h.from + 0.2);
      const tinted = await o.page.evaluate(([acc, scene]) => {
        const [r, g, b] = acc.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
        return [...document.querySelectorAll(`[data-scene="${scene}"] [data-slot]`)].filter((el) => el.textContent.trim() && getComputedStyle(el).color === `rgb(${r}, ${g}, ${b})`).map((el) => el.dataset.slot);
      }, [accent, h.scene]);
      const img = decodePng(await o.page.screenshot({ type: 'png' }));
      const { counted, total } = countPixels(img, isAccent, { step: 2 });
      rows.push({ scene: h.scene, tinted, share: counted / total, region: largestRegion(img, isAccent) / (img.width * img.height) });
    }
    for (const r of rows) {
      assert.equal(r.tinted.length, 1, `${r.scene}: one text in the accent, got ${JSON.stringify(r.tinted)}`);
      assert.ok(r.region >= 0.002, `${r.scene}: the accent shows as a solid spot (largest region ${(r.region * 100).toFixed(2)} % of the frame)`);
      assert.ok(r.share <= 0.25, `${r.scene}: accent share ${r.share.toFixed(3)}`);
    }
  } finally { await o.close(); }
});

test('blueprint reads as a drafting sheet: a fine grid in the ink role behind every scene, mono lettering for text, a dimensioned figure', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await openPiece(dirs.blueprint, { server, browser, format });
    try {
      const { holds, items } = (await o.mm.meta()).schedule;
      for (const h of holds) {
        await o.mm.seek(h.from + 0.2);
        const r = await o.page.evaluate((scene) => {
          const sc = document.querySelector(`[data-scene="${scene}"]`);
          const m = sc.querySelector('.mm-ground__mark');
          const box = m?.getBoundingClientRect();
          const body = [...sc.querySelectorAll('[data-slot]')].filter((el) => el.textContent.trim() && !/^"?Archivo/.test(getComputedStyle(el).fontFamily));
          return { loaded: !!m && m.complete && m.naturalWidth > 0, covers: !!box && box.left <= 0 && box.top <= 0 && box.right >= innerWidth && box.bottom >= innerHeight, alpha: m ? Number(getComputedStyle(m).opacity) : 0, faces: body.map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()) };
        }, h.scene);
        assert.ok(r.loaded && r.covers, `${format} ${h.scene}: the grid covers the frame ${JSON.stringify(r)}`);
        assert.ok(r.alpha > 0 && r.alpha <= 0.2, `${format} ${h.scene}: a faint grid, ${r.alpha}`);
        for (const f of r.faces) assert.equal(f, 'IBM Plex Mono', `${format} ${h.scene}: text set in mono`);
      }
      // the dimension's two halves are the figure's ::before and ::after, drawn at the figure's rest
      await o.mm.seek(holds.find((h) => h.scene === 'figure').from + 0.2);
      const halves = await o.page.evaluate(() => { const f = document.querySelector('[data-scene="figure"] [data-slot="figure"]'); return ['::before', '::after'].map((k) => parseFloat(getComputedStyle(f, k).width) || 0); });
      assert.ok(halves.every((w) => w > 20), `the figure carries its dimension marks: ${halves}`);
      assert.ok(items.some((x) => x.scene === 'figure' && x.emphasis));
    } finally { await o.close(); }
  }
});

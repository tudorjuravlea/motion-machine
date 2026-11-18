// text/lit-sweep in the browser: on every frame of the sweep every word is fully opaque and carries
// at least its floor of ink (its colour is a mix of ink into the canvas, never an alpha), and the
// lines break exactly where the plain text breaks; at rest the slot is the plain text in its own
// colour, unmoved and unrotated; and a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'lit-sweep-test');
const TEXT = 'We read what the light reaches, one line at a time';
const story = {
  id: 'lit-sweep-test', kind: 'film', formats: ['9x16', '16x9'], title: 'lit-sweep test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/statement', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.2, slot: 'headline', fx: 'text/lit-sweep', text: TEXT, params: { floor: 25 } }] }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser, dir;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'paper');
  const style = join(OUT, 'paper.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const SEL = '[data-scene="a"] [data-slot="headline"]';
// Each word's share of ink: where its colour sits on the Oklab path from the canvas (0) to the ink (1),
// the space the pattern mixes in.
const state = (o) => o.page.evaluate((s) => {
  const el = document.querySelector(s), cs = getComputedStyle(el);
  const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
  const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const oklab = ([r, gr, b]) => {
    const [R, G, B] = [lin(r), lin(gr), lin(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  // a computed colour (rgb, color(srgb …), oklab(…)) as the sRGB bytes the browser paints, then as Oklab, with its alpha
  const rgb = (c) => {
    g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
    return [...oklab(a ? [r, gr, b] : [0, 0, 0]), a / 255];
  };
  const probe = (v) => { const d = document.createElement('i'); d.style.color = v; el.append(d); const c = rgb(getComputedStyle(d).color); d.remove(); return c; };
  const ink = probe('var(--mm-color-ink)'), canvas = probe('var(--mm-color-canvas)');
  const share = (c) => { const ab = [0, 1, 2].map((i) => ink[i] - canvas[i]); const L = ab.reduce((a, v) => a + v * v, 0); return [0, 1, 2].reduce((a, i) => a + ab[i] * (c[i] - canvas[i]), 0) / L; };
  const words = [...el.querySelectorAll('.mm-lit-sweep__w')].map((w) => { const c = rgb(getComputedStyle(w).color); return { s: share(c), alpha: c.length > 3 ? c[3] : 1, o: Number(getComputedStyle(w).opacity), top: w.offsetTop }; });
  return { words, kids: el.children.length, text: el.textContent.replace(/\s+/g, ' ').trim(), h: el.offsetHeight, color: share(rgb(cs.color)), opacity: Number(cs.opacity), transform: cs.transform, rotate: cs.rotate, translate: cs.translate, visible: cs.visibility !== 'hidden' };
}, SEL);

for (const format of ['9x16', '16x9']) {
  test(`${format}: every word stays at or above its floor through the sweep, and the rest is the plain text at full strength`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
      await o.mm.seek(it.start + it.d + 0.3);
      const rest = await state(o);
      assert.equal(rest.kids, 0, 'no spans at rest');
      assert.equal(rest.text, TEXT);
      assert.ok(Math.abs(rest.color - 1) < 0.01, `the rest is the slot's own ink: ${rest.color}`);
      assert.ok(rest.opacity === 1 && rest.visible && rest.transform === 'none' && rest.rotate === 'none' && rest.translate === 'none', JSON.stringify(rest));
      let lit = 0, dim = 0;
      for (let t = it.start; t < it.start + it.d; t += 1 / 30) {
        await o.mm.seek(t);
        const s = await state(o);
        assert.equal(s.text, TEXT, `the whole text is on screen at ${t}`);
        assert.equal(s.words.length, TEXT.split(' ').length);
        for (const w of s.words) {
          assert.ok(w.o === 1 && w.alpha === 1, `a word is see-through at ${t}: ${JSON.stringify(w)}`);
          assert.ok(w.s >= 0.25 - 0.01, `a word below the floor at ${t}: ${w.s}`);
        }
        assert.equal(s.h, rest.h, `the block keeps its height at ${t}`);
        assert.ok(s.transform === 'none' && s.rotate === 'none', `never rotated at ${t}`);
        if (s.words.some((w) => w.s > 0.99) && s.words.some((w) => w.s < 0.3)) lit++;
        if (s.words.every((w) => w.s < 0.3)) dim++;
      }
      assert.ok(dim > 0, 'the sweep starts with every word at the floor');
      assert.ok(lit > 3, 'a gradient shows mid-sweep');
      // reading order: the first line lights before the last
      await o.mm.seek(it.start + it.d * 0.45);
      const mid = await state(o);
      const tops = [...new Set(mid.words.map((w) => w.top))];
      assert.ok(tops.length > 1, 'the text wraps');
      const lineMean = (top) => { const ws = mid.words.filter((w) => w.top === top); return ws.reduce((a, w) => a + w.s, 0) / ws.length; };
      assert.ok(lineMean(tops[0]) > lineMean(tops.at(-1)), 'the first line is ahead of the last');
    } finally { await o.close(); }
  });
}

test('a frame mid-sweep is the same whichever way the seek arrives', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
    const t = it.start + it.d * 0.5;
    await o.mm.seek(0);
    const fwd = await framePng(o.page, t);
    await o.mm.seek(4.9);
    const back = await framePng(o.page, t);
    assert.ok(Buffer.compare(fwd, back) === 0);
  } finally { await o.close(); }
});

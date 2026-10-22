// exits/knife-cut in the browser: a rule crosses every line of the text before anything folds; the
// fold only closes, never moves the text sideways or rotates it; just before the exit ends nothing
// of the element is left on screen (no height, no visible rule), and at its end the frame around it
// is the bare scene; a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'knife-cut-test');
const story = {
  id: 'knife-cut-test', kind: 'film', formats: ['9x16', '16x9'], title: 'knife-cut test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'The first draft, cut', out: 2.4, exit: 'exits/knife-cut', params: { exit: { rule: 'accent' } } }] }],
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
const state = (o) => o.page.evaluate((s) => {
  const el = document.querySelector(s), cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const rules = [...el.querySelectorAll('.mm-knife-cut')].map((n) => { const b = n.getBoundingClientRect(); return { w: b.width, h: b.height, o: Number(getComputedStyle(n).opacity), y: b.top + b.height / 2 }; });
  const range = document.createRange(); range.selectNodeContents(el);
  const lines = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
  return { box: { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, h: r.height }, rules, lines, rotate: cs.rotate, transform: cs.transform, translate: cs.translate, visible: cs.visibility !== 'hidden' };
}, SEL);

for (const format of ['9x16', '16x9']) {
  test(`${format}: the rules cross every line before the fold, the fold only closes, and the end leaves nothing`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
      assert.ok(it.exit?.d > 0);
      await o.mm.seek(it.exit.start - 0.05);
      const open = await state(o);
      let lastH = open.box.h, sawRules = 0, maxRules = 0;
      for (let t = it.exit.start; t < it.exit.start + it.exit.d; t += 1 / 120) {
        await o.mm.seek(t);
        const s = await state(o);
        if (!s.visible) break;
        assert.ok(s.box.h <= lastH + 0.5, `the fold reopens at ${t}`);
        assert.ok(Math.abs(s.box.x0 - open.box.x0) < 0.5 && Math.abs(s.box.x1 - open.box.x1) < 0.5, `no sideways travel at ${t}`);
        assert.ok(s.rotate === 'none', `never rotated at ${t}`);
        if (s.box.h > open.box.h - 0.5 && s.rules.length) {   // still open: the rules are crossing
          sawRules++; maxRules = Math.max(maxRules, s.rules.length);
          for (const r of s.rules) assert.ok(r.y > open.box.y0 && r.y < open.box.y1, 'each rule lies across the text');
        }
        lastH = s.box.h;
      }
      assert.ok(sawRules > 0, 'the rules show before the fold');
      assert.equal(maxRules, open.lines, 'one rule per line of text');
      // a hair before the end: no height and no visible rule
      await o.mm.seek(it.exit.start + it.exit.d - 0.002);
      const last = await state(o);
      assert.ok(!last.visible || (last.box.h < 1 && last.rules.every((r) => r.o < 0.02)), `nothing left: ${JSON.stringify(last)}`);
      // at the end: the region where the title was is the bare scene
      const end = it.exit.start + it.exit.d;
      const shown = decodePng(await framePng(o.page, end));
      await o.page.evaluate((s) => { const el = document.querySelector(s); el.textContent = ''; el.style.visibility = 'hidden'; }, SEL);
      const bare = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
      let diff = 0;
      for (let y = Math.max(0, Math.floor(open.box.y0) - 20); y < Math.min(shown.height, Math.ceil(open.box.y1) + 20); y++) for (let x = 0; x < shown.width; x++) {
        const i = (y * shown.width + x) * 4;
        if (Math.abs(shown.data[i] - bare.data[i]) + Math.abs(shown.data[i + 1] - bare.data[i + 1]) + Math.abs(shown.data[i + 2] - bare.data[i + 2]) > 6) diff++;
      }
      assert.equal(diff, 0, 'the end of the exit leaves no pixel behind');
    } finally { await o.close(); }
  });
}

test('a frame mid-cut is the same whichever way the seek arrives', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
    for (const k of [0.2, 0.7]) {
      const t = it.exit.start + it.exit.d * k;
      await o.mm.seek(0);
      const fwd = await framePng(o.page, t);
      await o.mm.seek(3.9);
      assert.ok(Buffer.compare(fwd, await framePng(o.page, t)) === 0, `at ${k}`);
    }
  } finally { await o.close(); }
});

test('the blade reads as a cut: a slit of the ground through the letters, thick enough to see next to display type, led by an edge in its role', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
      const t = it.exit.start + it.exit.d * 0.28;   // the blade most of the way across, nothing folded yet
      const img = decodePng(await framePng(o.page, t));
      const info = await o.page.evaluate((s) => {
        const el = document.querySelector(s);
        const probe = (v) => { const d = document.createElement('i'); d.style.color = v; document.querySelector('.mm-stage').append(d); const c = getComputedStyle(d).color.match(/[\d.]+/g).slice(0, 3).map(Number); d.remove(); return c; };
        const k = el.getBoundingClientRect().width / el.offsetWidth;
        return {
          canvas: probe('var(--mm-color-canvas)'), font: parseFloat(getComputedStyle(el).fontSize) * k,
          slits: [...el.querySelectorAll('.mm-knife-cut')].map((n) => { const b = n.getBoundingClientRect(); const tip = n.querySelector('.mm-knife-cut__tip'); return { x0: b.left, x1: b.right, y: b.top + b.height / 2, h: b.height, tip: !!tip }; }),
        };
      }, SEL);
      assert.ok(info.slits.length > 0, format);
      for (const s of info.slits) {
        assert.ok(s.h >= 0.05 * info.font, `${format}: the slit is ${s.h.toFixed(1)} px next to ${info.font.toFixed(0)} px type`);
        assert.ok(s.tip, `${format}: the slit is led by an edge`);
        let ground = 0, n = 0;
        const y = Math.round(s.y);
        for (let x = Math.ceil(s.x0); x < s.x0 + (s.x1 - s.x0) * 0.7; x++) {
          const i = (y * img.width + x) * 4; n++;
          if (Math.hypot(img.data[i] - info.canvas[0], img.data[i + 1] - info.canvas[1], img.data[i + 2] - info.canvas[2]) <= 6) ground++;
        }
        assert.ok(ground / n >= 0.9, `${format}: along the cut the letters are parted by the ground (${(100 * ground / n).toFixed(0)} %)`);
      }
    } finally { await o.close(); }
  }
});

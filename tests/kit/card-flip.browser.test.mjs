// entrances/card-flip in the browser: on every frame of the turn the drawn rotation is within a
// quarter turn (the x axis never points backwards, so no face is mirrored), the cover shows only
// while the text is unpainted, the text's ink stays inside the safe area under the perspective, and
// at rest the slot is unrotated, uncovered and painted; a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'card-flip-test');
const story = {
  id: 'card-flip-test', kind: 'film', formats: ['9x16', '16x9'], title: 'card-flip test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'cards', layout: 'layouts/paper-cards', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
      beats: [
        { at: 0.1, slot: 'headline', fx: 'entrances/fade', text: 'Turn them over' },
        { at: 0.3, slot: 'card-1', fx: 'entrances/card-flip', text: 'Faster setup' },
        { at: 0.5, slot: 'card-2', fx: 'entrances/card-flip', text: 'Fewer steps', params: { steps: 6 } },
      ] },
    { id: 'wide', layout: 'layouts/title-stack', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
      beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/card-flip', text: 'A wide title turns over' }] },
  ],
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

const SAFE = { '9x16': [72, 1080, 1920], '16x9': [64, 1920, 1080] };
const state = (o, sel) => o.page.evaluate((s) => {
  const el = document.querySelector(s), cs = getComputedStyle(el);
  const m = cs.transform === 'none' ? null : cs.transform.match(/matrix(3d)?\(([^)]*)\)/);
  const v = m ? m[2].split(',').map(Number) : null;
  const r = document.createRange(); r.selectNodeContents(el);
  // the ink of the text only (the cover is a child element with no text)
  const texts = [...el.childNodes].filter((n) => n.nodeType === 3);
  const ink = texts.length ? (() => { const q = document.createRange(); q.setStartBefore(texts[0]); q.setEndAfter(texts.at(-1)); const b = q.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; })() : null;
  return { m11: v ? v[0] : 1, rotated: !!v, cover: !!el.querySelector('.mm-card-flip__cover'), fill: cs.webkitTextFillColor, color: cs.color, visible: cs.visibility !== 'hidden', ink, rotate: cs.rotate, position: el.style.position };
}, sel);

for (const format of ['9x16', '16x9']) {
  test(`${format}: no face is ever drawn mirrored, the cover hides the text, and the ink stays inside the safe area`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const items = (await o.mm.meta()).schedule.items.filter((i) => i.fx === 'entrances/card-flip' && !i.parent);
      assert.equal(items.length, 3);
      const [m, W, H] = SAFE[format];
      for (const it of items) {
        let covers = 0, turning = 0;
        for (let t = it.start; t < it.start + it.d; t += 1 / 60) {
          await o.mm.seek(t);
          const s = await state(o, it.selector);
          if (!s.visible) continue;
          assert.ok(s.m11 >= -1e-6, `${it.selector} t ${t.toFixed(3)}: drawn mirrored (m11 ${s.m11})`);
          if (s.cover) { covers++; assert.equal(s.fill, 'rgba(0, 0, 0, 0)', `the text is unpainted under the cover at ${t}`); }
          else if (s.rotated) turning++;
          if (s.ink) assert.ok(s.ink.x0 >= m - 1 && s.ink.y0 >= m - 1 && s.ink.x1 <= W - m + 1 && s.ink.y1 <= H - m + 1, `${it.selector} t ${t.toFixed(3)}: ink ${JSON.stringify(s.ink)}`);
        }
        assert.ok(covers > 0 && turning > 0, `${it.selector}: the cover turns away, then the content turns in (${covers} / ${turning})`);
        await o.mm.seek(it.start + it.d + 0.1);
        const rest = await state(o, it.selector);
        assert.deepEqual({ rotated: rest.rotated, cover: rest.cover, rotate: rest.rotate, position: rest.position }, { rotated: false, cover: false, rotate: 'none', position: '' }, `${it.selector} at rest`);
        assert.notEqual(rest.fill, 'rgba(0, 0, 0, 0)', 'the text is painted at rest');
      }
    } finally { await o.close(); }
  });
}

test('a frame mid-turn is the same whichever way the seek arrives', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.fx === 'entrances/card-flip');
    for (const k of [0.3, 0.7]) {
      const t = it.start + it.d * k;
      await o.mm.seek(0);
      const fwd = await framePng(o.page, t);
      await o.mm.seek(5.9);
      assert.ok(Buffer.compare(fwd, await framePng(o.page, t)) === 0, `at ${k}`);
    }
  } finally { await o.close(); }
});

test('the cover stands off the canvas on every shipped brand (contrast 1.5 or more), so the flip reads on dark brands too', async () => {
  const { readdirSync } = await import('node:fs');
  const brands = readdirSync(join(ROOT, 'styles/brands')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const low = [];
  for (const brand of brands) {
    const bdir = join(OUT, `brand-${brand}`);
    const style = join(OUT, `${brand}.style.json`);
    rmSync(bdir, { recursive: true, force: true });
    composeToFile({ brand, motion: 'calm', out: style });
    newPiece({ kind: 'film', style, dir: bdir });
    writeFileSync(join(bdir, 'story.json'), JSON.stringify(story, null, 2));
    const o = await openPiece(bdir, { server, browser, format: '16x9' });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === '[data-scene="cards"] [data-slot="card-1"]');
      const [cover, canvas] = await o.page.evaluate((t) => {
        window.mm.seek(t);
        const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (m) return m[1].split(',').slice(0, 3).map(Number); return /color\(srgb ([^)]+)\)/.exec(c)[1].trim().split(/\s+/).slice(0, 3).map((v) => Number(v) * 255); };
        const c = document.querySelector('.mm-card-flip__cover');
        const d = document.createElement('i'); d.style.background = 'var(--mm-color-canvas)'; document.querySelector('.mm-stage').append(d);
        const out = [c ? rgb(getComputedStyle(c).backgroundColor) : null, rgb(getComputedStyle(d).backgroundColor)]; d.remove(); return out;
      }, it.start + it.d * 0.05);   // the calm entrance turns the first quarter fast
      assert.ok(cover, `${brand}: the cover shows early in the turn`);
      const [a, b] = [lum(cover), lum(canvas)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 1.5) low.push(`${brand}: ${ratio.toFixed(2)}`);
    } finally { await o.close(); }
  }
  assert.deepEqual(low, []);
});

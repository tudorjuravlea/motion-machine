// entrances/diagonal-join in the browser: asked for a slide far larger than the layout allows, no
// pixel of the title ever leaves the safe area (each half is held by its own room, so a title flush
// with the margin still slides); nothing is rotated; at rest the slot is the plain title exactly as
// laid out; and a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'diagonal-join-test');
const TEXT = 'Two halves, one title';
const story = {
  id: 'diagonal-join-test', kind: 'film', formats: ['9x16', '16x9'], title: 'diagonal-join test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/diagonal-join', text: TEXT, params: { gap: 6 } }] }],
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
const SAFE = { '9x16': [72, 1080, 1920], '16x9': [64, 1920, 1080] };

// the title's pixels: where the frame differs from the same frame with the title hidden
async function inkBox(o, t) {
  const shown = decodePng(await framePng(o.page, t));
  await o.page.evaluate((s) => { document.querySelector(s).style.visibility = 'hidden'; }, SEL);
  const bare = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < shown.height; y++) for (let x = 0; x < shown.width; x++) {
    const i = (y * shown.width + x) * 4;
    if (Math.abs(shown.data[i] - bare.data[i]) + Math.abs(shown.data[i + 1] - bare.data[i + 1]) + Math.abs(shown.data[i + 2] - bare.data[i + 2]) > 30) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}
const pose = (o) => o.page.evaluate((s) => {
  const el = document.querySelector(s), cs = getComputedStyle(el);
  const halves = [...el.querySelectorAll('.mm-diagonal-join__half')].map((h) => { const c = getComputedStyle(h); return { translate: c.translate, rotate: c.rotate, transform: c.transform, h: h.getBoundingClientRect().height }; });
  return { halves, kids: el.children.length, text: el.textContent, transform: cs.transform, rotate: cs.rotate, clip: cs.clipPath, position: el.style.position };
}, SEL);

for (const format of ['9x16', '16x9']) {
  test(`${format}: no pixel of the title leaves the safe area on any frame, and the halves really slide`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
      const [m, W, H] = SAFE[format];
      const rest = await inkBox(o, it.start + it.d + 0.2);
      assert.ok(rest.x0 >= m - 1, `the laid-out title sits inside the safe area: ${JSON.stringify(rest)}`);
      let moved = 0;
      for (let t = it.start + 1 / 30; t < it.start + it.d; t += 2 / 30) {
        const b = await inkBox(o, t);
        if (!Number.isFinite(b.x0)) continue;   // still faded out
        assert.ok(b.x0 >= m - 1 && b.y0 >= m - 1 && b.x1 <= W - m && b.y1 <= H - m, `${format} t ${t.toFixed(3)}: ink ${JSON.stringify(b)} outside the safe area`);
        if (Math.abs(b.x1 - rest.x1) > 20 || Math.abs(b.y0 - rest.y0) > 20) moved++;
        const s = await pose(o);
        assert.equal(s.halves.length, 2, `two halves at ${t}`);
        assert.ok(Math.abs(s.halves[0].h - s.halves[1].h) < 0.5, `the copy wraps as the slot does at ${t}: ${s.halves.map((h) => h.h)}`);
        for (const h of [s, ...s.halves.map(({ h: _, ...r }) => r)]) assert.ok(h.rotate === 'none' && h.transform === 'none', `never rotated at ${t}: ${JSON.stringify(h)}`);
      }
      assert.ok(moved > 2, `the halves slide (frames away from home: ${moved})`);
    } finally { await o.close(); }
  });
}

test('at rest the slot is the plain title, uncut and unmoved; a frame is the same in either seek order', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
    await o.mm.seek(it.start + it.d + 0.2);
    const s = await pose(o);
    assert.deepEqual({ kids: s.kids, text: s.text, transform: s.transform, rotate: s.rotate, clip: s.clip, position: s.position }, { kids: 0, text: TEXT, transform: 'none', rotate: 'none', clip: 'none', position: '' });
    const t = it.start + it.d * 0.4;
    await o.mm.seek(0);
    const fwd = await framePng(o.page, t);
    await o.mm.seek(2.9);
    assert.ok(Buffer.compare(fwd, await framePng(o.page, t)) === 0);
  } finally { await o.close(); }
});

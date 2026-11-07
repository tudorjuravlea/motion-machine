// emphasis/roulette in the browser: the box starts on the first option, hugs each option's text (not
// its full-width layout box), sits exactly on the answer (the element carrying the emphasis) from
// the landing to the end and is drawn only while the emphasis runs; the answer is marked (accent
// text, accent underline) from the landing through the rest of the scene and never before it; no
// other option's text or style changes; a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { LAND } from '../../patterns/emphasis/roulette/pattern.js';

const OUT = join(ROOT, 'out', 'roulette-test');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const story = {
  id: 'roulette-test', kind: 'film', formats: ['9x16', '16x9'], title: 'roulette test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/list-reveal', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.1, slot: 'headline', fx: 'entrances/fade', text: 'Which day ships?' },
      ...DAYS.map((d, i) => ({ at: 0.2 + 0.05 * i, slot: `item-${i + 1}`, fx: 'entrances/fade', text: d, ...(i === 3 ? { emphasis: 'emphasis/roulette', params: { passes: 2, instant: true } } : {}) })),
    ] }],
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

const state = (o) => o.page.evaluate(() => {
  const centre = (n) => { const r = n.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height }; };
  const items = [...document.querySelectorAll('[data-scene="a"] [data-slot^="item-"]:not([data-empty])')];
  const box = document.querySelector('.mm-roulette');
  const accent = (() => { const d = document.createElement('i'); d.style.color = 'var(--mm-accent-text)'; items[0].append(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
  const ans = getComputedStyle(items[3]);
  return {
    box: box ? { ...centre(box), o: Number(getComputedStyle(box).opacity) } : null,
    // each option's centre is the centre of its text (a Range over it), where the box hugs it
    items: items.map((n) => { const r = document.createRange(); r.selectNodeContents(n); return { ...centre(r), w: n.getBoundingClientRect().width, text: n.textContent, style: n === items[3] ? null : n.getAttribute('style') ?? '' }; }),
    marked: ans.visibility !== 'hidden' && Number(ans.opacity) > 0 && ans.color === accent && ans.textDecorationLine.includes('underline'),
    line: parseFloat(ans.lineHeight) * items[3].getBoundingClientRect().width / items[3].offsetWidth,   // in page px
  };
});

for (const format of ['9x16', '16x9']) {
  test(`${format}: the box starts on the first option, lands on the answer and holds there, and touches no option`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.emphasis);
      const { start, d } = it.emphasis;
      await o.mm.seek(start - 0.02);
      assert.equal((await state(o)).box, null, 'no box before the emphasis');
      assert.equal((await state(o)).marked, false, 'the answer is not seen marked before the emphasis (it arrives instant, as the run starts)');
      await o.mm.seek(start + 0.001);   // the run is fastest at its start, so look at its first instant
      const first = await state(o);
      assert.ok(first.box && Math.abs(first.box.y - first.items[0].y) < 6, `starts on the first option: ${JSON.stringify(first.box)} vs ${JSON.stringify(first.items[0])}`);
      let landed = 0;
      for (let t = start; t < start + d; t += 1 / 30) {
        await o.mm.seek(t);
        const s = await state(o);
        assert.deepEqual(s.items.map((i) => i.text), DAYS, `the options are unchanged at ${t}`);
        for (const i of s.items) if (i.style !== null) assert.ok(!/outline|background|color|scale|transform/.test(i.style), `an option was restyled at ${t}: ${i.style}`);
        if (s.box) assert.ok(s.box.w < 0.6 * s.items[0].w && s.box.h <= s.line + 1, `the box hugs the text at ${t}: ${JSON.stringify(s.box)} vs a line of ${s.line}`);
        assert.equal(s.marked, (t - start) / d >= LAND, `the answer is marked from the landing only, at ${t}`);
        if ((t - start) / d >= LAND + 0.01 && s.box) {
          landed++;
          assert.ok(Math.abs(s.box.x - s.items[3].x) < 1 && Math.abs(s.box.y - s.items[3].y) < 1, `held on the answer at ${t}: ${JSON.stringify(s.box)} vs ${JSON.stringify(s.items[3])}`);
        }
      }
      assert.ok(landed > 5, 'the box holds on the answer for a while');
      await o.mm.seek(start + d + 0.05);
      const after = await state(o);
      assert.equal(after.box, null, 'no box after the emphasis');
      assert.ok(after.marked, 'the answer stays marked through the rest of the scene');
      await o.mm.seek(4.9);
      assert.ok((await state(o)).marked, 'still marked at the end of the scene');
    } finally { await o.close(); }
  });
}

test('a frame mid-run is the same whichever way the seek arrives', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const { start, d } = (await o.mm.meta()).schedule.items.find((i) => i.emphasis).emphasis;
    for (const k of [0.25, 0.5, 0.8]) {
      const t = start + d * k;
      await o.mm.seek(0);
      const fwd = await framePng(o.page, t);
      await o.mm.seek(4.9);
      assert.ok(Buffer.compare(fwd, await framePng(o.page, t)) === 0, `at ${k}`);
    }
  } finally { await o.close(); }
});

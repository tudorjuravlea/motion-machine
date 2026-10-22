// entrances/light-reveal in the browser: the block never moves, scales or rotates; it opens faint,
// the share of the title at full strength only grows as the front crosses, and at rest the slot is
// exactly as laid out (no mask, no fill) at full strength; a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'light-reveal-test');
const story = {
  id: 'light-reveal-test', kind: 'film', formats: ['9x16', '16x9'], title: 'light-reveal test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.2, slot: 'headline', fx: 'entrances/light-reveal', text: 'Light finds the line' }] }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
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

const SEL = '[data-scene="a"] [data-slot="headline"]';
const pose = (o) => o.page.evaluate((s) => {
  const el = document.querySelector(s), cs = getComputedStyle(el), r = el.getBoundingClientRect();
  return { rect: [r.left, r.top, r.width, r.height], rotate: cs.rotate, transform: cs.transform, mask: cs.maskImage, bg: cs.backgroundImage, fill: cs.webkitTextFillColor, visible: cs.visibility !== 'hidden' };
}, SEL);

for (const brand of ['paper', 'nocturne']) for (const format of ['9x16', '16x9']) {
  test(`${brand} ${format}: the block stays put, opens faint, and its lit share only grows to the whole title`, async () => {
    const o = await openPiece(dirs[brand], { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
      const end = it.start + it.d + 0.2;
      await o.mm.seek(end);
      const rest = await pose(o);
      assert.deepEqual({ rotate: rest.rotate, transform: rest.transform, mask: rest.mask, bg: rest.bg }, { rotate: 'none', transform: 'none', mask: 'none', bg: 'none' }, 'nothing written at rest');
      assert.notEqual(rest.fill, 'rgba(0, 0, 0, 0)');
      const full = decodePng(await framePng(o.page, end));
      await o.page.evaluate((s) => { document.querySelector(s).style.visibility = 'hidden'; }, SEL);
      const bare = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
      // the title's solid ink at rest, and how strong each of those pixels is in a frame
      const ink = [];
      for (let i = 0; i < full.data.length; i += 4) {
        const dd = Math.abs(full.data[i] - bare.data[i]) + Math.abs(full.data[i + 1] - bare.data[i + 1]) + Math.abs(full.data[i + 2] - bare.data[i + 2]);
        if (dd > 150) ink.push(i);
      }
      assert.ok(ink.length > 1000, 'the title has ink');
      const strengths = (png) => ink.map((i) => {
        let best = 0;
        for (let c = 0; c < 3; c++) { const den = full.data[i + c] - bare.data[i + c]; if (Math.abs(den) > 40) best = Math.max(best, (png.data[i + c] - bare.data[i + c]) / den); }
        return best;
      });
      let lastLit = -1, first = null;
      for (let t = it.start + 0.001; t < it.start + it.d; t += 1 / 30) {
        const png = decodePng(await framePng(o.page, t));
        const s = await pose(o);
        assert.deepEqual(s.rect, rest.rect, `the block never moves or scales (t ${t.toFixed(3)})`);
        assert.ok(s.rotate === 'none' && s.transform === 'none', `never rotated at ${t}`);
        const st = strengths(png);
        first ??= st;
        const lit = st.filter((v) => v > 0.9).length / st.length;
        assert.ok(lit >= lastLit - 0.01, `the lit share falls at ${t.toFixed(3)}: ${lastLit} -> ${lit}`);
        lastLit = lit;
      }
      const faint = first.filter((v) => v < 0.25).length / first.length;
      assert.ok(faint > 0.97, `the block opens faint: ${faint}`);
      assert.ok(lastLit > 0.6, `most of the title is lit by the end of the entrance: ${lastLit}`);
    } finally { await o.close(); }
  });
}

test('a frame mid-reveal is the same whichever way the seek arrives', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
    const t = it.start + it.d * 0.4;
    await o.mm.seek(0);
    const fwd = await framePng(o.page, t);
    await o.mm.seek(2.9);
    assert.ok(Buffer.compare(fwd, await framePng(o.page, t)) === 0);
  } finally { await o.close(); }
});

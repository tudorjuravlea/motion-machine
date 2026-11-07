// The glyph anchor finder on real letters: the brands' own faces rasterised by text/garden's cell
// drawer and read by runtime/kit/glyphs.js. "l" has two stroke ends, "o" none, "T" three; every
// anchor lies within 0.03 em of the ink; and the same seed roots the same anchors on the same
// letters after a reflow into another format (another size, another line break).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'glyphs-test');
const story = {
  id: 'glyphs-test', kind: 'film', formats: ['9x16', '16x9'], title: 'glyphs test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'intro', layout: 'layouts/statement', duration: 2, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }] },
    { id: 'g', layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [{ at: 0.2, slot: 'headline', fx: 'text/garden', text: 'Tall stories hold', params: { dur: 2, seed: 9 } }] },
  ],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const brand of ['linen', 'signal', 'paper']) {
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

// Terminals and anchors of single letters in the display face, read in the page.
const readLetters = (o, chars) => o.page.evaluate(async (cs) => {
  const g = await import('/runtime/kit/glyphs.js');
  const garden = await import('/patterns/text/garden/pattern.js');
  const h = document.querySelector('[data-slot="headline"]');
  const st = getComputedStyle(h);
  const font = { style: st.fontStyle, weight: st.fontWeight, family: st.fontFamily };
  await document.fonts.load(`${font.weight} 64px ${font.family}`);
  const out = {};
  for (const c of cs) {
    const a = g.analyse(garden.glyphCell(document, font, c));
    const list = g.anchors(a, { seed: 4, density: 1.6, index: 0, char: c });
    out[c] = { terminals: a.terminals.length, family: font.family, anchors: list.map((p) => ({ ...p, d: g.sdfAt(a, p.x, p.y) })) };
  }
  return out;
}, chars);

test('real letters in sans display faces: "l" has two stroke ends, "o" none, "T" three', async () => {
  for (const brand of ['linen', 'signal']) {
    const o = await openPiece(dirs[brand], { server, browser, format: '9x16' });
    try {
      const r = await readLetters(o, ['l', 'o', 'T']);
      assert.equal(r.l.terminals, 2, `${brand} (${r.l.family}) "l"`);
      assert.equal(r.o.terminals, 0, `${brand} (${r.o.family}) "o"`);
      assert.equal(r.T.terminals, 3, `${brand} (${r.T.family}) "T"`);
    } finally { await o.close(); }
  }
});

test('a serif face keeps one stroke end per stroke: the serifs\' corners are pruned, not counted', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const r = await readLetters(o, ['l', 'o', 'T', 'H', 'x', 'v']);
    const got = Object.fromEntries(Object.entries(r).map(([c, v]) => [c, v.terminals]));
    assert.deepEqual(got, { l: 2, o: 0, T: 3, H: 4, x: 4, v: 2 }, `${r.T.family}`);
  } finally { await o.close(); }
});

test('every anchor on a real letter lies within 0.03 em of its ink', async () => {
  for (const brand of ['linen', 'signal', 'paper']) {
    const o = await openPiece(dirs[brand], { server, browser, format: '9x16' });
    try {
      const r = await readLetters(o, [...'aegklmorsTWy']);
      for (const [c, v] of Object.entries(r)) {
        assert.ok(v.anchors.length >= 1, `${brand} "${c}" has anchors`);
        for (const p of v.anchors) assert.ok(p.d <= 0.001 && p.d >= -0.03, `${brand} "${c}": anchor ${p.kind} at ${p.d.toFixed(4)} em from the edge`);
      }
    } finally { await o.close(); }
  }
});

test('the same seed roots the same anchors on the same letters after a reflow into another format', async () => {
  const anchorsIn = async (format) => {
    const o = await openPiece(dirs.paper, { server, browser, format });
    try {
      const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'g' && x.beat?.slot === 'headline');
      await o.mm.seek(it.start + it.d + 0.2);
      return await o.page.evaluate(async () => {
        const garden = await import('/patterns/text/garden/pattern.js');
        const m = garden.modelOf(document.querySelector('[data-scene="g"] [data-slot="headline"]'));
        return { lines: new Set(m.letters.map((l) => Math.round(l.base))).size, em: m.em, letters: m.letters.map((l) => ({ ch: l.ch, anchors: l.anchors })) };
      });
    } finally { await o.close(); }
  };
  const tall = await anchorsIn('9x16'), wide = await anchorsIn('16x9');
  assert.notEqual(tall.lines, wide.lines, `the line breaks differ (${tall.lines} vs ${wide.lines} lines)`);
  assert.ok(tall.letters.reduce((s, l) => s + l.anchors.length, 0) > 10, 'anchors were found');
  assert.deepEqual(tall.letters, wide.letters);
});

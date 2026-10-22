// emphasis/emote in the page: a drawn reaction pops beside the words and goes. Nothing is written
// before or after its window; while it shows it sits off the words and inside the safe area, in
// every format, clear of every other line in its scene too; with no free place it draws nothing and
// warns; it shivers on the boil clock in a film and holds still in a deck; it never touches the
// text, so G-OVERLAP and G-BRAND stay green on paper and nocturne.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { MARKS } from '../../patterns/emphasis/emote/pattern.js';

const OUT = join(ROOT, 'out', 'emote-test');
const SIDES = ['right', 'left', 'top', 'right', 'left', 'top', 'right', 'left'];
const scene = (mark, i) => ({
  id: `s-${mark}`, layout: 'layouts/statement', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.1, slot: 'headline', fx: 'entrances/rise', text: i % 2 ? 'A short line' : 'A headline that runs a little longer', emphasis: 'emphasis/emote', params: { mark, side: SIDES[i] } },
    { at: 0.6, slot: 'sub', fx: 'entrances/fade', text: 'A line of support under it.' },
  ],
});
const SCENES = MARKS.map(scene);
const story = (kind, scenes) => ({
  id: 'emote-test', kind, formats: ['9x16', '16x9', '1x1'], title: 'emote test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
// scenes where other words sit close: a line above a long headline, a sub under it, a headline over a sub
const LONG = 'Most teams we spoke to asked for fewer status calls and longer stretches of quiet work';
const beat = (slot, text, extra = {}) => ({ at: 0.1, slot, fx: 'entrances/fade', text, ...extra });
const emote = (mark, more = {}) => ({ emphasis: 'emphasis/emote', params: { mark, ...more } });
const CROWD = [
  { id: 'c-endtop', layout: 'layouts/endcard', beats: [beat('line', 'Start the next one today'), beat('headline', LONG, emote('exclaim', { side: 'top' }))] },
  { id: 'c-endright', layout: 'layouts/endcard', beats: [beat('line', 'Start the next one today'), beat('headline', LONG, emote('heart'))] },
  { id: 'c-statement', layout: 'layouts/statement', beats: [beat('headline', LONG, emote('question', { side: 'left', size: 1 })), beat('sub', 'So the afternoons went back to building, week after week, all year long.')] },
  { id: 'c-stack', layout: 'layouts/title-stack', beats: [beat('headline', LONG), beat('sub', 'A second line of words that runs long enough to wrap', emote('sparkle', { side: 'top' }))] },
].map((sc) => ({ ...sc, duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.' }));
function piece(name, brand, kind = 'film') {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  const style = join(OUT, `${brand}.style.json`);
  composeToFile({ brand, motion: 'calm', out: style });
  newPiece({ kind, style, dir });
  const scenes = kind === 'deck' ? SCENES.slice(0, 2).map(({ duration, ...s }) => ({ ...s, presses: 2, beats: s.beats.map((b, i) => ({ ...b, at: 0, step: i + 1 })) })) : name === 'crowd' ? CROWD : SCENES;
  writeFileSync(join(dir, 'story.json'), JSON.stringify({ ...story(kind, scenes), ...(name === 'crowd' ? { formats: ['9x16', '16x9', '1x1', '4x5'] } : {}) }, null, 2));
  return dir;
}

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dirs.paper = piece('paper', 'paper');
  dirs.nocturne = piece('nocturne', 'nocturne');
  dirs.deck = piece('deck', 'paper', 'deck');
  dirs.crowd = piece('crowd', 'paper');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const headline = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
const LOOK = (el) => {
  const svg = el.querySelector(':scope > svg.mm-emote');
  const g = svg?.querySelector('g');
  // the laid-out lines of the slot's own text (its text nodes, not the mark's svg)
  const words = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement.closest('svg')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0) words.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  const stage = document.querySelector('.mm-stage').getBoundingClientRect();
  const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe')) || 0;
  const b = g?.getBoundingClientRect();
  // the ink's own extent: the geometry's box grown by half the widest stroke drawn (the halo)
  const k = svg ? svg.getBoundingClientRect().width / (parseFloat(svg.getAttribute('width')) || 1) : 1;
  const half = g ? Math.max(0, ...[...g.querySelectorAll('path')].map((p) => (parseFloat(getComputedStyle(p).strokeWidth) || 0) / 2)) * k : 0;
  const strokes = g ? [...g.querySelectorAll('path')].map((p) => { const cs = getComputedStyle(p); return { cls: p.getAttribute('class'), stroke: cs.stroke, fill: cs.fill, so: cs.strokeOpacity, fo: cs.fillOpacity, w: parseFloat(cs.strokeWidth) || 0 }; }) : [];
  const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  return {
    strokes, accent: rgb(getComputedStyle(document.documentElement).getPropertyValue('--mm-color-accent').trim()),
    ink: b ? { x: b.left - half, y: b.top - half, w: b.width + 2 * half, h: b.height + 2 * half } : null,
    svg: !!svg,
    paths: g ? [...g.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|') : null,
    box: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null,
    transform: g?.getAttribute('transform') ?? null,
    opacity: svg?.style.opacity ?? null,
    words,
    safe: { x0: stage.left + safe, y0: stage.top + safe, x1: stage.right - safe, y1: stage.bottom - safe },
  };
};
async function look(o, t, id) {
  await o.mm.seek(t);
  return o.page.evaluate(([sc, src]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="headline"]`)), [id, LOOK.toString()]);
}
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test('nothing before or after the window; during it the mark pops, holds and fades', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const it = await headline(o, 's-heart'), e = it.emphasis;
    assert.equal((await look(o, e.start - 0.05, 's-heart')).svg, false);
    assert.equal((await look(o, e.start + e.d + 0.05, 's-heart')).svg, false);
    const pop = await look(o, e.start + 0.03 * e.d, 's-heart');
    assert.match(pop.transform ?? '', /scale\(0\.\d+\)/, `growing: ${pop.transform}`);
    const hold = await look(o, e.start + 0.5 * e.d, 's-heart');
    assert.equal(hold.transform, null, 'whole size through the hold');
    assert.equal(hold.opacity, '');
    const fade = await look(o, e.start + 0.92 * e.d, 's-heart');
    assert.ok(Number(fade.opacity) > 0 && Number(fade.opacity) < 1, `fading: ${fade.opacity}`);
  } finally { await o.close(); }
});

test('every mark, in every format, sits off the words and inside the safe area', async () => {
  for (const format of ['9x16', '16x9', '1x1']) {
    const o = await openPiece(dirs.paper, { server, browser, format });
    try {
      for (const mark of MARKS) {
        const it = await headline(o, `s-${mark}`), e = it.emphasis;
        // the pop's peak and the hold: the overshoot moves away from the words
        for (const f of [0.15, 0.5]) {
          const l = await look(o, e.start + f * e.d, `s-${mark}`);
          assert.ok(l.svg && l.paths, `${format} ${mark}: drawn`);
          for (const w of l.words) assert.ok(!overlap(l.ink, w), `${format} ${mark} at ${f}: mark's ink ${JSON.stringify(l.ink)} on the words ${JSON.stringify(w)}`);
          assert.ok(l.ink.x >= l.safe.x0 - 1 && l.ink.y >= l.safe.y0 - 1 && l.ink.x + l.ink.w <= l.safe.x1 + 1 && l.ink.y + l.ink.h <= l.safe.y1 + 1, `${format} ${mark}: outside the safe area ${JSON.stringify(l.ink)} ${JSON.stringify(l.safe)}`);
        }
      }
    } finally { await o.close(); }
  }
});

test('a mark never lands on any words in its scene, in all four formats; when no place is free it draws nothing and says so in mm.warnings', async () => {
  let drawn = 0, left = 0;
  for (const format of ['9x16', '16x9', '1x1', '4x5']) {
    const o = await openPiece(dirs.crowd, { server, browser, format });
    try {
      const items = (await o.mm.meta()).schedule.items.filter((it) => it.emphasis && !it.parent);
      assert.equal(items.length, CROWD.length);
      for (const it of items) {
        for (const f of [0.15, 0.5]) {
          await o.mm.seek(it.emphasis.start + f * it.emphasis.d);
          const r = await o.page.evaluate(([scene, slot]) => {
            const sc = document.querySelector(`[data-scene="${scene}"]`);
            const g = sc.querySelector(`[data-slot="${slot}"] svg.mm-emote g`);
            const words = [];
            const walk = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              if (!n.textContent.trim() || n.parentElement.closest('svg')) continue;
              const range = document.createRange(); range.selectNodeContents(n);
              for (const q of range.getClientRects()) if (q.width > 1) words.push({ x: q.left, y: q.top, w: q.width, h: q.height, slot: n.parentElement.closest('[data-slot]')?.dataset.slot });
            }
            const b = g?.getBoundingClientRect();
            return { box: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null, words, warnings: window.mm.warnings };
          }, [it.scene, it.beat.slot]);
          if (!r.box) {
            assert.ok(r.warnings.some((w) => w.includes('emphasis/emote') && w.includes(it.scene)), `${format} ${it.scene}: no mark and no warning: ${JSON.stringify(r.warnings)}`);
            if (f === 0.5) left++;
            continue;
          }
          if (f === 0.5) drawn++;
          for (const w of r.words) assert.ok(!overlap(r.box, w), `${format} ${it.scene} at ${f}: mark ${JSON.stringify(r.box)} on the ${w.slot} ${JSON.stringify(w)}`);
        }
      }
    } finally { await o.close(); }
  }
  assert.ok(drawn >= 12, `drawn ${drawn}, left out ${left}`);
});

test('drawn in the full accent over a soft halo of the accent, three quarters of the unit tall', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const unit = 160;   // the 9x16 film unit (SPEC §12)
    for (const mark of MARKS) {
      const it = await headline(o, `s-${mark}`), e = it.emphasis;
      const l = await look(o, e.start + 0.5 * e.d, `s-${mark}`);
      const lines = l.strokes.filter((s) => s.cls === 'mm-emote__stroke'), halos = l.strokes.filter((s) => s.cls === 'mm-emote__halo');
      if (lines.length) {
        assert.ok(halos.length >= lines.length, `${mark}: a halo under every stroke`);
        for (const s of lines) { assert.equal(s.stroke, l.accent, `${mark}: the stroke is the accent`); assert.equal(Number(s.so), 1, `${mark}: at full opacity`); }
        for (const h of halos) { assert.equal(h.stroke, l.accent, `${mark}: the halo is the accent`); assert.ok(Number(h.so) > 0 && Number(h.so) < 0.6, `${mark}: soft (${h.so})`); assert.ok(h.w > lines[0].w * 2, `${mark}: wider than the stroke`); }
      }
      for (const d of l.strokes.filter((s) => s.cls === 'mm-emote__dot')) assert.equal(d.fill, l.accent, `${mark}: dots in the accent`);
      // a wash reads as the accent itself where its layers overlap, not a dim tint of it
      const at = l.strokes.findIndex((s) => s.cls === 'mm-emote__wash');
      if (at >= 0) {
        const layers = [];   // the layers of the first washed shape: the run of washes drawn one after another
        for (let i = at; i < l.strokes.length && l.strokes[i].cls === 'mm-emote__wash'; i++) layers.push(l.strokes[i]);
        const cover = 1 - layers.reduce((a, w) => a * (1 - Number(w.fo)), 1);
        assert.ok(cover >= 0.9, `${mark}: the wash covers ${cover.toFixed(2)} of the accent`);
      }
      // three quarters of the unit on its longer side (a heart is a little wider than tall, the ellipsis a row)
      const side = Math.max(l.box.w, l.box.h);
      assert.ok(side >= 0.75 * unit * 0.85 && side <= 0.75 * unit * 1.25, `${mark}: ${side} px on its longer side`);
    }
  } finally { await o.close(); }
});

test('it shivers on the boil clock in a film, the same at every seek; in a deck it holds still', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const it = await headline(o, 's-zzz'), e = it.emphasis;
    // two instants in the hold, either side of a boil step (every 0.4 s of the piece)
    const step = Math.ceil((e.start + 0.25 * e.d) / 0.4) * 0.4;
    assert.ok(step + 0.03 < e.start + 0.72 * e.d, 'a boil step inside the hold');
    const a = await look(o, step - 0.03, 's-zzz'), b = await look(o, step + 0.03, 's-zzz');
    assert.notEqual(a.paths, b.paths, 'the next boil frame is another stroke');
    assert.equal((await look(o, step - 0.03, 's-zzz')).paths, a.paths, 'the same instant, the same stroke');
  } finally { await o.close(); }
  const d = await openPiece(dirs.deck, { server, browser, format: '9x16' });
  try {
    const it = await headline(d, 's-exclaim'), e = it.emphasis;
    const lengths = await d.page.evaluate(() => window.mm.schedule.pressLengths);
    const at = (f) => it.press - 1 + (e.at + f * e.d) / lengths[it.press];
    const x = await look(d, at(0.35), 's-exclaim'), y = await look(d, at(0.65), 's-exclaim');
    assert.ok(x.paths, 'drawn in the deck');
    assert.equal(x.paths, y.paths, 'a deck shows one still frame of the mark');
  } finally { await d.close(); }
});

test('the marks never touch the text: G-OVERLAP and G-BRAND pass on paper and nocturne', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const r = await runCheck(dirs[brand], { format: '9x16', only: ['G-OVERLAP', 'G-BRAND'], server, browser });
    for (const id of ['G-OVERLAP', 'G-BRAND']) {
      const row = r.rules.find((x) => x.id === id);
      assert.equal(row.status, 'PASS', `${brand} ${id}: ${JSON.stringify(row)}`);
    }
  }
});

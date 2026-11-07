// entrances/character keeps its drawing inside its slot and its slot out of the text's way: the
// liveliest idle at rest stays inside the slot box in every shipped brand and format, the stage
// yields to the text so a stacked layout keeps every line inside the safe area, and a body path
// far larger than the mascot's box never paints over the text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { compose } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const BRANDS = ['paper', 'nocturne', 'linen', 'signal'];
const FORMATS = ['16x9', '9x16', '1x1', '4x5'];
const story = (params) => ({
  id: 'character-fit', title: 'character fit', kind: 'film', formats: FORMATS, language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  cta: { text: 'Say hello', url: 'example.org' },
  scenes: [{
    id: 'meet', layout: 'layouts/split', duration: 5, cut: 'transitions/hard-cut', move: null,
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/rise', text: 'Meet the helper today' },
      { at: 0.6, slot: 'figure', fx: 'entrances/character', params },
      { at: 1.0, slot: 'body', fx: 'entrances/fade', text: 'It reacts, then keeps the beat for you' },
    ],
  }],
});

let server, browser, base;
const piece = (dir, style, params) => {
  const d = newPiece({ kind: 'film', style, dir });
  writeFileSync(join(d, 'story.json'), JSON.stringify(story(params)));
  return d;
};
before(async () => {
  server = await serveRoot(ROOT); browser = await launchBrowser();
  base = mkdtempSync(join(ROOT, '.tmp-character-fit-'));
  for (const brand of BRANDS) {
    const file = join(base, `${brand}.json`);
    writeFileSync(file, JSON.stringify(compose({ brand, motion: 'calm' })));
    piece(join(base, brand), file, { mood: 'excited', idle: 1.5 });
  }
  // a schema-valid body traced at the wrong scale: 250 times the box it claims
  const linen = JSON.parse(readFileSync(join(ROOT, 'styles/brands/linen.json'), 'utf8'));
  const huge = { box: [8, 10], ground: [0, 0], views: { front: { body: 'M-999 -999 H999 V999 H-999 Z', face: { cx: 0, cy: -5, gap: 2.4, size: 1 } } } };
  const brandFile = join(base, 'huge-brand.json');
  writeFileSync(brandFile, JSON.stringify({ ...linen, name: 'huge', mascot: huge }));
  const hugeStyle = join(base, 'huge.json');
  writeFileSync(hugeStyle, JSON.stringify(compose({ brand: brandFile, motion: 'calm', from: { brand: 'huge-brand.json', motion: 'styles/motion/calm.json' } })));
  piece(join(base, 'huge'), hugeStyle, { mood: 'calm' });
  piece(join(base, 'plain'), join(base, 'linen.json'), { mood: 'calm' });
});
after(async () => { await browser?.close(); await server?.close(); if (base) rmSync(base, { recursive: true, force: true }); });

// the rig's painted geometry (clip paths excluded), the slot, every text line, and the safe area
const MEASURE = () => {
  const slot = document.querySelector('[data-scene="meet"] [data-slot="figure"]');
  const svg = slot.querySelector(':scope > svg.mm-rig');
  const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const union = (rs) => (rs.length ? { l: Math.min(...rs.map((r) => r.l)), t: Math.min(...rs.map((r) => r.t)), r: Math.max(...rs.map((r) => r.r)), b: Math.max(...rs.map((r) => r.b)) } : null);
  const painted = svg ? union([...svg.querySelectorAll('path, ellipse, circle, rect')].filter((n) => !n.closest('clipPath')).map((n) => box(n.getBoundingClientRect())).filter((r) => r.r > r.l || r.b > r.t)) : null;
  const texts = [...document.querySelectorAll('[data-scene="meet"] [data-slot]')].filter((e) => e !== slot && e.textContent.trim()).map((e) => {
    const rg = document.createRange(); rg.selectNodeContents(e);
    return { slot: e.dataset.slot, ...union([...rg.getClientRects()].filter((x) => x.width > 0).map(box)) };
  });
  const cs = getComputedStyle(document.documentElement), px = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const m = px('--mm-safe');
  return { slot: box(slot.getBoundingClientRect()), painted, texts, safe: { l: m, t: m, r: px('--mm-frame-w') - m, b: px('--mm-frame-h') - m }, overflow: svg && getComputedStyle(svg).overflow };
};
const outside = (a, b) => Math.max(b.l - a.l, a.r - b.r, b.t - a.t, a.b - b.b, 0);
const meets = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

for (const brand of BRANDS) {
  test(`${brand}: the liveliest idle (excited, idle 1.5) stays inside the slot box at rest in every format, and every text line stays inside the safe area`, async () => {
    const problems = [];
    for (const format of FORMATS) {
      const o = await openPiece(join(base, brand), { server, browser, format });
      try {
        const { schedule } = await o.mm.meta();
        const hold = schedule.holds.find((h) => h.scene === 'meet');
        let worst = { out: 0 }, touch = null, edge = null, n = 0;
        for (let t = hold.from; t <= Math.min(hold.to, hold.from + 1.4); t += 1 / 30) {
          await o.mm.seek(t);
          const m = await o.page.evaluate(MEASURE);
          if (!m.painted) { problems.push(`${format}: no drawing at ${t.toFixed(3)}`); continue; }
          n++;
          const out = outside(m.painted, m.slot);
          if (out > worst.out) worst = { out, t };
          for (const x of m.texts) {
            if (!touch && meets(m.painted, x)) touch = `${format}: the character touches the ${x.slot} at ${t.toFixed(3)}`;
            if (!edge && outside(x, m.safe) > 0.5) edge = `${format}: the ${x.slot} leaves the safe area by ${outside(x, m.safe).toFixed(1)} px`;
          }
          if (t === hold.from) {
            if (m.overflow !== 'hidden') problems.push(`${format}: the rig does not clip to its slot (overflow ${m.overflow})`);
            if (m.slot.b - m.slot.t <= 40) problems.push(`${format}: the stage keeps no room: ${(m.slot.b - m.slot.t).toFixed(0)} px`);
          }
        }
        if (n < 30) problems.push(`${format}: only ${n} instants of rest measured`);
        if (worst.out > 0.5) problems.push(`${format}: the idle leaves the slot box by ${worst.out.toFixed(1)} px at ${worst.t.toFixed(3)} s`);
        for (const x of [touch, edge]) if (x) problems.push(x);
        if (o.errors.length) problems.push(`${format}: ${o.errors[0]}`);
      } finally { await o.close(); }
    }
    assert.deepEqual(problems, []);
  });
}

test('a body path far larger than its box draws inside the slot and leaves every pixel of the text as it is', async () => {
  for (const format of ['1x1', '9x16']) {
    const shots = [];
    for (const name of ['huge', 'plain']) {
      const o = await openPiece(join(base, name), { server, browser, format });
      try {
        const { schedule } = await o.mm.meta();
        const hold = schedule.holds.find((h) => h.scene === 'meet');
        await o.mm.seek(hold.from + 0.3);
        const m = await o.page.evaluate(MEASURE);
        assert.ok(outside(m.painted, m.slot) <= 0.5, `${name} ${format}: drawn ${JSON.stringify(m.painted)} outside the slot ${JSON.stringify(m.slot)}`);
        const head = m.texts.find((x) => x.slot === 'headline');
        shots.push(await o.page.screenshot({ clip: { x: head.l, y: head.t, width: head.r - head.l, height: head.b - head.t } }));
      } finally { await o.close(); }
    }
    assert.ok(shots[0].equals(shots[1]), `${format}: the headline is painted over`);
  }
});

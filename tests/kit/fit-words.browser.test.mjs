// The headline fit counts a word broken across lines as overflow: a word wider than its column is
// never split between letters at rest while a smaller size (down to the body floor) would keep it
// whole, in every layout with a headline that may break a word, so the layouts agree with
// title-stack (which never breaks a word). A long question over long list items fits the square format: the items yield
// with the headline.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { newPiece } from '../../scripts/new.mjs';

const FLOOR = { '9x16': 44, '1x1': 40, '4x5': 42, '16x9': 36 };
const one = (id, layout, text) => ({ id, layout, duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text, params: { instant: true } }] });
const QUESTION = 'Which quarter opens the new regional programme?';
const SCENES = [
  one('hook', 'layouts/statement', 'Words'),
  one('intl', 'layouts/statement', 'Internationalisation'),
  one('why', 'layouts/statement', 'Why decentralisation?'),
  one('stack', 'layouts/title-stack', 'Interoperability'),
  one('stack-intl', 'layouts/title-stack', 'Internationalisation'),
  one('lc-intl', 'layouts/label-column', 'Internationalisation'),
  one('lr-intl', 'layouts/list-reveal', 'Internationalisation'),
  one('st-inter', 'layouts/statement', 'Interoperability'),
  one('lc-inter', 'layouts/label-column', 'Interoperability'),
  one('lr-inter', 'layouts/list-reveal', 'Interoperability'),
  one('lc', 'layouts/label-column', 'Electroluminescence'),
  { ...one('sl', 'layouts/shortlist', 'Electroluminescence everywhere'), beats: [
    { at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Electroluminescence everywhere', params: { instant: true } },
    ...['Harbour', 'Loft', 'Mill', 'Yard'].map((text, i) => ({ at: 0.2 + 0.1 * i, slot: `item-${i + 1}`, fx: 'entrances/pop', text, ...(i === 2 ? { params: { pick: true } } : {}) })),
    { at: 1, slot: 'result', fx: 'entrances/drop', text: 'Seats two hundred' },
  ] },
  { ...one('pile', 'layouts/pile-up', 'Electroluminescence'), beats: [
    { at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Electroluminescence', params: { instant: true } },
    ...['First card', 'Second card', 'Third card'].map((text, i) => ({ at: 0.2 + 0.2 * i, slot: `card-${i + 1}`, fx: 'entrances/fade', text })),
  ] },
  { ...one('quiz', 'layouts/list-reveal', QUESTION), beats: [
    { at: 0, slot: 'headline', fx: 'entrances/fade', text: QUESTION, params: { instant: true } },
    { at: 0.2, slot: 'item-1', fx: 'entrances/fade', text: 'The first quarter of next year' },
    { at: 0.4, slot: 'item-2', fx: 'entrances/fade', text: 'The second quarter, after review' },
    { at: 0.6, slot: 'item-3', fx: 'entrances/fade', text: 'Straight after the summer break' },
  ] },
];
const FORMATS = ['9x16', '1x1', '16x9', '4x5'];

let server, browser, base, dir;
before(async () => {
  server = await serveRoot(ROOT); browser = await launchBrowser();
  base = mkdtempSync(join(ROOT, '.tmp-fit-words-'));
  dir = newPiece({ kind: 'film', style: 'nocturne-kinetic', dir: join(base, 'film') });
  writeFileSync(join(dir, 'story.json'), JSON.stringify({ id: 'fit-words', title: 'fit words', kind: 'film', formats: FORMATS, language: 'en', facts: [],
    audio: { track: null, bpm: null, beats: null }, scenes: SCENES, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' } }));
});
after(async () => { await browser?.close(); await server?.close(); if (base) rmSync(base, { recursive: true, force: true }); });

// The visible scene's headline: its size, the words split across lines, and every slot's text past the safe area.
const PROBE = () => {
  const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
  const W = innerWidth, H = innerHeight;
  for (const s of document.querySelectorAll('[data-scene]')) {
    if (getComputedStyle(s).visibility === 'hidden') continue;
    const h = s.querySelector('[data-slot="headline"]:not([data-empty])');
    if (!h) continue;
    const split = [], outside = [];
    const walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const m of n.textContent.matchAll(/[^\s­-]+[­-]?/g)) {
        const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top)));
        if (tops.size > 1) split.push(m[0]);
      }
    }
    for (const el of s.querySelectorAll('[data-slot]:not([data-empty])')) {
      if (!el.textContent.trim() || getComputedStyle(el).visibility === 'hidden') continue;
      const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect();
      const o = Math.max(safe - b.left, b.right - (W - safe), safe - b.top, b.bottom - (H - safe));
      if (b.width && o > 0.5) outside.push(`${el.dataset.slot} ${o.toFixed(1)} px`);
    }
    return { scene: s.dataset.scene, px: parseFloat(getComputedStyle(h).fontSize), split, outside };
  }
  return null;
};

for (const format of FORMATS) {
  test(`${format}: no headline word is split between letters at rest, and every text stays in the safe area`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const { schedule, warnings } = await o.mm.meta();
      const bad = [];
      for (const t of schedule.rests) {
        await o.mm.seek(t);
        const r = await o.page.evaluate(PROBE);
        if (!r) continue;
        if (r.split.length) bad.push(`${r.scene}: ${r.split.join(', ')} split across lines at ${r.px} px`);
        if (r.px < FLOOR[format] - 0.01) bad.push(`${r.scene}: headline at ${r.px} px, under the body floor`);
        if (r.outside.length) bad.push(`${r.scene}: ${r.outside.join(', ')} outside the safe area`);
      }
      assert.deepEqual(bad, []);
      assert.deepEqual(warnings.filter((w) => /breaks a word/.test(w)), [], 'no headline is left breaking a word');
    } finally { await o.close(); }
  });
}

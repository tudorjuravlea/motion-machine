// Edge cases of the sketch patterns, each pinned by a test.
// Story: tests/kit/media/sketch-edge.json (one scene per case), sketch-deck.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '9x16', story = 'sketch-edge') => openPiece(PAGE, { server, browser, format, query: { story } });
const sceneOf = async (o, id) => (await o.mm.meta()).schedule.scenes.find((s) => s.id === id);
async function look(o, t, scene, slot, fn, arg = null) {
  await o.mm.seek(t);
  return o.page.evaluate(([sc, sl, src, a]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`), a), [scene, slot, fn.toString(), arg]);
}
// how far the pen's box leaves the slot's border box (px; 0 or less is inside)
const OUT = (el) => {
  const p = el.querySelector('svg.mm-sketch path'), r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
  return Math.max(r.left - b.left, b.right - r.right, r.top - b.top, b.bottom - r.bottom);
};
// how far the line sits from the finished slot's edge, less half the pen (px)
const LANDS = (el, ink) => {
  const p = el.querySelector('svg.mm-sketch path'), b = p.getBoundingClientRect();
  const r = document.querySelector(`[data-scene="${ink}"] [data-slot="${el.dataset.slot}"]`).getBoundingClientRect();
  return Math.max(Math.abs(b.left - r.left), Math.abs(b.right - r.right), Math.abs(b.top - r.top), Math.abs(b.bottom - r.bottom)) - parseFloat(getComputedStyle(p).strokeWidth) / 2;
};
const OPACITY = (el) => Number(getComputedStyle(el).opacity);

test('a sketched slot that holds another slot draws one outline, whatever the seek order (AXIOM 1)', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'desk');
    for (const t of [2, 2.1, 2.2, 2.3, 2]) assert.equal(await look(o, s.start + t, 'desk', 'desk', (el) => el.querySelectorAll('svg.mm-sketch').length), 1, `at ${t}`);
  } finally { await o.close(); }
});

test('the pen never strikes the slot\'s text: a slot without padding is drawn round its words', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await open(format);
    try {
      const s = await sceneOf(o, 'desk');
      const gap = await look(o, s.start + 2.5, 'desk', 'caption', (el) => {
        const p = el.querySelector(':scope > svg.mm-sketch path'), b = p.getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(el.querySelector('[data-text]') ?? el.firstChild ?? el);
        const t = [...rg.getClientRects()].reduce((a, r) => ({ l: Math.min(a.l, r.left), r: Math.max(a.r, r.right), t: Math.min(a.t, r.top), b: Math.max(a.b, r.bottom) }), { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity });
        const half = parseFloat(getComputedStyle(p).strokeWidth) / 2;
        return Math.min(t.l - b.left, b.right - t.r, t.t - b.top, b.bottom - t.b) - half;
      });
      assert.ok(gap >= 0, `${format}: the outline clears the words by ${gap} px`);
    } finally { await o.close(); }
  }
});

test('a slot with a border, a tiny slot at roughness 2: the pen stays inside the slot', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await open(format);
    try {
      const b = await sceneOf(o, 'border'), s = await sceneOf(o, 'small');
      for (const slot of ['left', 'right']) assert.ok(await look(o, b.start + 2.5, 'border', slot, OUT) <= 0.5, `${format} ${slot}`);
      assert.ok(await look(o, s.start + 2.5, 'small', 'item-1', OUT) <= 0.5, `${format} small`);
    } finally { await o.close(); }
  }
});

test('the wireframe holds over any layout styling: no mask, no label plate, the label waits for the pen', async () => {
  const o = await open();
  try {
    const p = await sceneOf(o, 'paper');
    assert.match(await look(o, p.start + 2.5, 'paper', 'card-1', (el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage), /^none$/);
    const t = await sceneOf(o, 'tile');
    const mid = await look(o, t.start + 0.3 + 0.3 * 1.5, 'tile', 'tile-1', (el) => {
      const l = el.querySelector('[data-text]');
      return { plate: getComputedStyle(l).backgroundColor, ink: getComputedStyle(l).color };
    });
    assert.match(mid.plate, /rgba\(0, 0, 0, 0\)/, 'the label plate is off');
    assert.match(mid.ink, /\b0\)$|\/ 0\)$/, `the label waits: ${mid.ink}`);
  } finally { await o.close(); }
});

test('sketch-to-ink under camera moves: the line lands on the finished edge', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'ink2');
    for (const slot of ['tile-1', 'tile-2']) {
      const off = await look(o, s.start + 0.9 * s.cut.d, 'wire2', slot, LANDS, 'ink2');
      assert.ok(off < 1.5, `${slot} is ${off} px off the edge`);
    }
  } finally { await o.close(); }
});

test('sketch-to-ink wins over an entrance that writes filter: the finished tile waits, the old line leaves', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'ink2');
    assert.equal(await look(o, s.start, 'ink2', 'tile-1', OPACITY), 0, 'a blur-fade tile still waits at p = 0');
    assert.equal(await look(o, s.start + 0.9 * s.cut.d, 'wire2', 'headline', OPACITY), 0, 'the old blur-fade headline has left');
  } finally { await o.close(); }
});

test('sketch-to-ink: no flight onto an empty slot; an unpaired slot leaves; a sketched cascade is inked', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'ink2');
    assert.equal(await look(o, s.start + 0.5 * s.cut.d, 'wire2', 'tile-3', (el) => el.style.getPropertyValue('--mm-tx-ink-to')), '', 'tile-3 has no finished partner');
    assert.equal(await look(o, s.start + 0.5 * s.cut.d, 'ink2', 'tile-3', (el) => el.style.getPropertyValue('--mm-tx-alpha')), '', 'the empty slot is left alone');
    const l = await sceneOf(o, 'list3');
    assert.equal(await look(o, l.start + 0.9 * l.cut.d, 'list2', 'item-4', OPACITY), 0, 'a slot with no partner has left before p = 1');
    const kids = await look(o, l.start + 0.97 * l.cut.d, 'list2', 'item-2', (el) => [...el.querySelectorAll('svg.mm-sketch')].map((s) => Number(s.style.opacity || 1)));
    assert.ok(kids.length >= 1 && kids.every((x) => x < 0.05), `every child's line has lifted: ${kids}`);
  } finally { await o.close(); }
});

test('sketch-to-ink: the same words in another place cross over; the incoming layout\'s own decorations wait', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'ink3');
    assert.equal(await look(o, s.start + 0.9 * s.cut.d, 'wire3', 'headline', OPACITY), 0, 'the old headline has left: the new one is elsewhere');
    await o.mm.seek(s.start + 0.1 * s.cut.d);
    assert.equal(await o.page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-scene="ink3"] .title-stack__rule')).opacity)), 0);
  } finally { await o.close(); }
});

test('sketch-to-ink in a deck inks in press order, then the beat\'s at', async () => {
  const o = await open('16x9', 'sketch-deck');
  try {
    const m = await o.mm.meta(), s = m.schedule.scenes.find((x) => x.id === 'ink');
    const x = s.start + (0.2 * s.cut.d) / m.schedule.pressLengths[s.start + 1];
    const ink = (el) => Number(el.style.getPropertyValue('--mm-tx-ink') || 0);
    const a = await look(o, x, 'wire', 'tile-1', ink), b = await look(o, x, 'wire', 'tile-2', ink);
    assert.ok(a > b, `tile-1 (press 1) inks before tile-2 (press 2): ${a} vs ${b}`);
  } finally { await o.close(); }
});

test('a slot whose only words belong to a slot inside it is drawn inside itself, not round those words', async () => {
  const o = await open();
  try {
    const s = await sceneOf(o, 'desk');
    assert.ok(await look(o, s.start + 2.5, 'desk', 'desk', OUT) <= 0.5, 'the desk outline stays on the frame');
  } finally { await o.close(); }
});

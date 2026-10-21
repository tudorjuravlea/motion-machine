// entrances/sketch and transitions/sketch-to-ink: a slot drawn as a wireframe by a
// shivering pen, then inked into the finished UI by the cut. Stories: tests/kit/media/sketch.json
// (film) and sketch-deck.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}, format = '9x16', story = 'sketch') => openPiece(PAGE, { server, browser, format, query: { story, ...query } });
const itemOf = (sched, scene, slot) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === slot);

// what a sketched slot shows: its pen path, the dash, the label's colour, the slot's own fill
const SKETCH = (el) => {
  const svg = el.querySelector(':scope > svg.mm-sketch'), path = svg?.querySelector('path.mm-sketch__pen');
  const cs = getComputedStyle(el), r = el.getBoundingClientRect(), b = path?.getBoundingClientRect();
  const label = el.querySelector('[data-text]') ?? el;
  return {
    d: path?.getAttribute('d') ?? null,
    subpaths: (path?.getAttribute('d')?.match(/M/g) ?? []).length,
    dash: path ? path.style.strokeDashoffset : null,
    opacity: svg ? svg.style.opacity : null,
    fill: cs.backgroundColor,
    text: getComputedStyle(label).color,
    inside: b ? b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5 : null,
  };
};
async function look(o, t, scene, slot, fn = SKETCH) {
  await o.mm.seek(t);
  return o.page.evaluate(([sc, sl, src]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`)), [scene, slot, fn.toString()]);
}
const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c) ?? /color\(srgb ([^)]+)\)/.exec(c); const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return p.length > 3 ? p[3] : 1; };

test('entrances/sketch: mid-way the pen is drawing a double stroke and the label has not arrived; the slot shows no fill of its own', async () => {
  const o = await open();
  try {
    const it = itemOf((await o.mm.meta()).schedule, 'wire', 'tile-1');
    const mid = await look(o, it.start + 0.3 * it.d, 'wire', 'tile-1');
    assert.equal(mid.subpaths, 2, JSON.stringify(mid));
    assert.ok(Number(mid.dash) > 0 && Number(mid.dash) < 1, `the pen is part-way: ${mid.dash}`);
    assert.equal(alpha(mid.text), 0, 'the label waits for the outline');
    assert.equal(alpha(mid.fill), 0, 'a wireframe has no fill: the tile\'s own colour is off');
    assert.equal(mid.inside, true, 'the pen stays inside the slot');
  } finally { await o.close(); }
});

test('entrances/sketch: at rest the outline is whole, the label is ink, and the stroke shivers on the boil clock, the same at every seek', async () => {
  const o = await open();
  try {
    const t = 3.2;   // every tile has arrived; boil frame floor(3.2 / 0.4) % 3 = 2
    const a = await look(o, t, 'wire', 'tile-1');
    assert.equal(a.dash, '', 'no dash left at rest');
    assert.equal(alpha(a.text), 1);
    assert.equal(a.inside, true);
    assert.equal((await look(o, t, 'wire', 'tile-1')).d, a.d, 'a seek to the same instant draws the same stroke');
    assert.equal((await look(o, t + 1.2, 'wire', 'tile-1')).d, a.d, 'three frames later the same frame comes round');
    const b = await look(o, t + 0.4, 'wire', 'tile-1');
    assert.notEqual(b.d, a.d, 'the next boil frame is another stroke');
    const pill = await look(o, t, 'wire', 'tile-3');
    assert.ok(pill.d && pill.d !== a.d && pill.inside, 'tile-3 is a pill, inside its slot');
  } finally { await o.close(); }
});

test('entrances/sketch: a style with motion.boil 0 keeps the stroke still', async () => {
  const o = await open({ boil: 0 });
  try {
    const a = await look(o, 3.2, 'wire', 'tile-1'), b = await look(o, 3.6, 'wire', 'tile-1');
    assert.ok(a.d, JSON.stringify(a));
    assert.equal(b.d, a.d);
  } finally { await o.close(); }
});

test('entrances/sketch in a deck: every rest is a still picture, whichever press', async () => {
  const o = await open({}, '16x9', 'sketch-deck');
  try {
    const p1 = await look(o, 1, 'wire', 'tile-1'), p3 = await look(o, 3, 'wire', 'tile-1');
    assert.ok(p1.d, JSON.stringify(p1));
    assert.equal(p3.d, p1.d, 'press 3 shows press 1\'s stroke: no shiver in a deck');
  } finally { await o.close(); }
});

// ---- transitions/sketch-to-ink: the cut from the wireframe scene to the finished one ----

// how much a stroke still wanders: the mean distance of each control point from the line through
// its neighbours (a ruled line is 0)
const WOBBLE = (el) => {
  const d = el.querySelector(':scope > svg.mm-sketch path')?.getAttribute('d') ?? '';
  const first = d.split('M')[1] ?? '';
  const p = [...first.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  let s = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    s += Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / len;
  }
  return { wobble: s / Math.max(1, p.length - 2), ink: Number(el.style.getPropertyValue('--mm-tx-ink') || 0), opacity: el.querySelector(':scope > svg.mm-sketch')?.style.opacity ?? null };
};
const FILTER = (el) => getComputedStyle(el).opacity;   // what the cut lets show (its --mm-tx-alpha outranks an entrance)
const opacityOf = Number;

test('transitions/sketch-to-ink: the cut opens on exactly the sketch at rest, the finished tiles not yet there', async () => {
  const o = await open();
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'ink');
    const before = await look(o, sc.start - 0.01, 'wire', 'tile-1');   // the same boil frame as the cut's first instant
    const open0 = await look(o, sc.start, 'wire', 'tile-1');
    assert.equal(open0.d, before.d, 'not a pixel of the sketch moves as the cut begins');
    assert.equal(opacityOf(await look(o, sc.start, 'ink', 'tile-1', FILTER)), 0);
    const bg = await o.page.evaluate(() => getComputedStyle(document.querySelector('[data-scene="ink"]')).backgroundColor);
    assert.match(bg, /rgba\(0, 0, 0, 0\)|transparent/, 'the incoming scene lets the sketch show through');
  } finally { await o.close(); }
});

test('transitions/sketch-to-ink: piece by piece, in drawing order, the line straightens, the finished tile comes in, the line lifts', async () => {
  const o = await open();
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'ink');
    const D = sc.cut.d;
    const rest = await look(o, sc.start, 'wire', 'tile-1', WOBBLE);
    const mid = await look(o, sc.start + 0.3 * D, 'wire', 'tile-1', WOBBLE);
    const late = await look(o, sc.start + 0.3 * D, 'wire', 'tile-3', WOBBLE);
    assert.ok(mid.ink > late.ink, `tile-1 inks before tile-3: ${mid.ink} vs ${late.ink}`);
    assert.ok(mid.wobble < rest.wobble * 0.6, `the line straightens: ${mid.wobble} vs ${rest.wobble}`);
    const near = await look(o, sc.start + 0.97 * D, 'wire', 'tile-1', WOBBLE);
    assert.ok(near.wobble < rest.wobble * 0.15, `at the end the line is ruled: ${near.wobble} vs ${rest.wobble}`);
    assert.ok(Number(near.opacity) < 0.05, `and lifted: ${near.opacity}`);
    const tile = opacityOf(await look(o, sc.start + 0.6 * D, 'ink', 'tile-1', FILTER));
    assert.ok(tile > 0.5 && tile <= 1, `the finished tile is coming in: ${tile}`);
    assert.equal(await look(o, sc.start + 0.3 * D, 'wire', 'tile-1', WOBBLE).then((x) => x.wobble), mid.wobble, 'a seek back draws the same state');
  } finally { await o.close(); }
});

test('transitions/sketch-to-ink: a line that changes crosses over at the end; at the end nothing of the cut remains', async () => {
  const o = await open();
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'ink');
    const D = sc.cut.d;
    assert.equal(opacityOf(await look(o, sc.start + 0.5 * D, 'ink', 'headline', FILTER)), 0, 'the new headline waits');
    const x = opacityOf(await look(o, sc.start + 0.92 * D, 'ink', 'headline', FILTER));
    assert.ok(x > 0 && x < 1, `then crosses over: ${x}`);
    assert.equal(opacityOf(await look(o, sc.start + 0.92 * D, 'wire', 'headline', FILTER)), 0, 'the old line has left before the new one arrives: never two lines in one place');
    const end = await look(o, sc.start + D + 0.01, 'ink', 'tile-1', (el) => ({ alpha: el.style.getPropertyValue('--mm-tx-alpha'), section: el.closest('[data-scene]').getAttribute('style') ?? '' }));
    assert.deepEqual(end, { alpha: '', section: '' });
  } finally { await o.close(); }
});

test('transitions/sketch-to-ink in a deck: the same words stay put under the ink, and the rest after the press is the finished scene', async () => {
  const o = await open({}, '16x9', 'sketch-deck');
  try {
    const m = await o.mm.meta(), sc = m.schedule.scenes.find((s) => s.id === 'ink');
    const L = m.schedule.pressLengths[sc.start + 1];
    const x = sc.start + (0.3 * sc.cut.d) / L;   // 30 % into the cut, inside the press that brings the scene
    assert.ok((await look(o, x, 'wire', 'tile-1', WOBBLE)).ink > 0);
    assert.equal(opacityOf(await look(o, x, 'ink', 'headline', FILTER)), 0, 'the same headline waits under the outgoing one');
    assert.deepEqual(await look(o, sc.start + 1, 'ink', 'tile-1', (el) => ({ alpha: el.style.getPropertyValue('--mm-tx-alpha'), hidden: getComputedStyle(el).visibility })), { alpha: '', hidden: 'visible' });
  } finally { await o.close(); }
});

test('transitions/sketch-to-ink: the line lands on the finished slot\'s own edge, a pill included', async () => {
  const o = await open();
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'ink');
    await o.mm.seek(sc.start + 0.9 * sc.cut.d);
    const fit = await o.page.evaluate(() => ['tile-1', 'tile-3'].map((slot) => {
      const path = document.querySelector(`[data-scene="wire"] [data-slot="${slot}"] svg.mm-sketch path`);
      const b = path.getBoundingClientRect(), r = document.querySelector(`[data-scene="ink"] [data-slot="${slot}"]`).getBoundingClientRect();
      const pen = parseFloat(getComputedStyle(path).strokeWidth);
      // the stroke's centre line sits half a pen inside the edge: its box is the slot less one pen
      return Math.max(Math.abs(b.left - r.left), Math.abs(b.right - r.right), Math.abs(b.top - r.top), Math.abs(b.bottom - r.bottom)) - pen / 2;
    }));
    for (const off of fit) assert.ok(off < 1.5, `the line is on the edge: ${fit}`);
  } finally { await o.close(); }
});

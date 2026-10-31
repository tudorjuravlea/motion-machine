// The gauge, unit-grid, waterfall, bubble, versus, delta, object-card and swing patterns in the page:
// what they show at rest is the fact, the variant comes from the beat, else the brand, else the
// pattern, and nothing is left mid-motion. Counter's compact format is checked here too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'data-cards-test');
const D = 6;   // every scene lasts 6 s: it arrives at 0.3 s and rests long before the end
const beat = (slot, fx, extra = {}) => ({ at: 0.3, slot, fx, ...extra });
const scene = (id, layout, beats) => ({ id, layout, duration: D, cut: 'transitions/hard-cut', move: null, say: `Test scene ${id}.`, beats });
const SCENES = [
  scene('counter', 'layouts/title-stack', [beat('headline', 'data/counter', { value: 14000, fact: 'f', params: { format: 'compact' } })]),
  scene('counter2', 'layouts/title-stack', [beat('headline', 'data/counter', { value: 1200000, fact: 'f', params: { format: 'compact', fix: 1, prefix: '$' } })]),
  scene('arc', 'layouts/title-stack', [beat('headline', 'data/gauge', { value: 68, fact: 'f', params: { variant: 'arc' } })]),
  scene('needle', 'layouts/title-stack', [beat('headline', 'data/gauge', { value: 82, fact: 'f', params: { variant: 'needle' } })]),
  scene('brandgauge', 'layouts/title-stack', [beat('headline', 'data/gauge', { value: 40, fact: 'f' })]),
  scene('meter', 'layouts/title-stack', [beat('headline', 'data/gauge', { value: 58, fact: 'f', params: { variant: 'meter' } })]),
  scene('rings', 'layouts/title-stack', [beat('headline', 'data/gauge', { value: 80, fact: 'f', params: { variant: 'rings', values: '84,62,41', labels: 'A,B,C' } })]),
  scene('waffle', 'layouts/title-stack', [beat('headline', 'data/unit-grid', { value: 37, fact: 'f', params: { variant: 'waffle' } })]),
  scene('corner', 'layouts/title-stack', [beat('headline', 'data/unit-grid', { value: 20, fact: 'f', params: { variant: 'waffle', order: 'distance', corner: 'br' } })]),
  scene('isotype', 'layouts/title-stack', [beat('headline', 'data/unit-grid', { value: 7, fact: 'f', params: { variant: 'isotype', of: 10 } })]),
  scene('pictobar', 'layouts/title-stack', [beat('headline', 'data/unit-grid', { value: 4.5, fact: 'f', params: { variant: 'pictobar', of: 10, fix: 1 } })]),
  scene('waterfall', 'layouts/title-stack', [beat('headline', 'data/waterfall', { value: 120, fact: 'f', params: { values: '100,45,-30', labels: 'A,B,C' } })]),
  scene('bubble', 'layouts/title-stack', [beat('headline', 'data/bubble', { value: 400, fact: 'f', params: { ref: 100, refLabel: 'one' } })]),
  scene('versus', 'layouts/title-stack', [beat('headline', 'data/versus', { fact: 'f', params: { values: '42,87', labels: 'Before,After' } })]),
  scene('delta', 'layouts/title-stack', [beat('headline', 'data/delta', { value: 12.4, fact: 'f', params: { fix: 1 } })]),
  scene('deltadown', 'layouts/title-stack', [beat('headline', 'data/delta', { value: -8, fact: 'f', params: { good: 'down' } })]),
  scene('card', 'layouts/object-card', [beat('object', 'entrances/fade'), beat('figure', 'data/counter', { value: 9, fact: 'f' })]),
  scene('cardbeat', 'layouts/object-card', [beat('object', 'entrances/fade', { params: { variant: 'tag' } }), beat('figure', 'data/counter', { value: 9, fact: 'f' })]),
  scene('swing', 'layouts/title-stack', [beat('headline', 'entrances/swing', { text: 'Hanging' })]),
];
const story = {
  id: 'data-cards-test', kind: 'film', formats: ['9x16', '16x9'], title: 'data cards test', language: 'en',
  facts: [{ id: 'f', text: 'Test figure', source: 'test fixture, an invented figure' }],
  audio: { track: null, bpm: null, beats: null },
  scenes: SCENES,
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
const startOf = (id) => SCENES.findIndex((s) => s.id === id) * D;
const rest = (id) => startOf(id) + D - 0.2;
const SEL = (id) => `[data-scene="${id}"] [data-slot="headline"]`;

let server, browser, dir;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'piece');
  const style = join(OUT, 'style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  const st = JSON.parse(readFileSync(style, 'utf8'));
  // the brand's defaults: a semi dial for every gauge, a calendar for every object card
  st.patterns = { 'data/gauge': { variant: 'semi' }, 'layouts/object-card': { variant: 'calendar' } };
  writeFileSync(style, JSON.stringify(st, null, 2));
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (format = '9x16') => openPiece(dir, { server, browser, format });
const text = (o, id) => o.page.evaluate((sel) => document.querySelector(sel).textContent.replace(/\s+/g, ' ').trim(), SEL(id));

test('counter: format compact writes a scaled unit and keeps the fix', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('counter'));
    assert.equal(await text(o, 'counter'), '14K');
    await o.mm.seek(rest('counter2'));
    assert.equal(await text(o, 'counter2'), '$1.2M');
  } finally { await o.close(); }
});

test('gauge: the arc covers the value\'s share of its sweep, the readout is the value, nothing is mid-motion at rest', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('arc'));
    const r = await o.page.evaluate((sel) => {
      const el = document.querySelector(sel), f = el.querySelector('.mm-gauge__fill'), t = el.querySelector('.mm-gauge__track');
      const dash = (c) => c.getAttribute('stroke-dasharray').split(' ').map(Number);
      return { fill: dash(f)[0], track: dash(t)[0], variant: el.dataset.variant, readout: el.querySelector('.mm-gauge__readout').textContent };
    }, SEL('arc'));
    assert.equal(r.variant, 'arc');
    assert.ok(Math.abs(r.fill / r.track - 0.68) < 1e-3, `fill ${r.fill} of ${r.track}`);
    assert.equal(r.readout, '68%');
  } finally { await o.close(); }
});

test('gauge: the needle points at the value at rest, and is somewhere else (not on the value) while it swings', async () => {
  const o = await open();
  try {
    const angle = () => o.page.evaluate((sel) => Number(/rotate\(([-\d.]+)/.exec(document.querySelector(`${sel} .mm-gauge__needle`).parentElement.getAttribute('transform'))[1]), SEL('needle'));
    await o.mm.seek(rest('needle'));
    assert.ok(Math.abs((await angle()) - (135 + 270 * 0.82)) < 1e-2);
    await o.mm.seek(startOf('needle') + 0.3 + 0.3);
    assert.ok(Math.abs((await angle()) - (135 + 270 * 0.82)) > 5, 'mid-swing');
  } finally { await o.close(); }
});

test('gauge: the variant is the beat\'s, else the brand\'s, else the pattern\'s', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('brandgauge'));
    assert.equal(await o.page.evaluate((s) => document.querySelector(s).dataset.variant, SEL('brandgauge')), 'semi', 'the brand\'s default');
    await o.mm.seek(rest('meter'));
    assert.equal(await o.page.evaluate((s) => document.querySelector(s).dataset.variant, SEL('meter')), 'meter', 'the beat wins');
    await o.mm.seek(rest('arc'));
    assert.equal(await o.page.evaluate((s) => document.querySelector(s).dataset.variant, SEL('arc')), 'arc');
  } finally { await o.close(); }
});

test('gauge: rings draw one ring and one legend row per value, each counting to its value', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('rings'));
    const r = await o.page.evaluate((sel) => ({ fills: document.querySelectorAll(`${sel} .mm-gauge__fill`).length, rows: [...document.querySelectorAll(`${sel} .mm-gauge__row`)].map((x) => x.textContent.replace(/\s+/g, ' ').trim()) }), SEL('rings'));
    assert.equal(r.fills, 3);
    assert.deepEqual(r.rows, ['A84%', 'B62%', 'C41%']);
  } finally { await o.close(); }
});

test('unit-grid: N units are lit at rest, in reading order or from the chosen corner, and the figure is N', async () => {
  const o = await open();
  try {
    const lit = (id) => o.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .mm-ug__unit`)].map((u, i) => (u.hasAttribute('data-lit') ? i : -1)).filter((i) => i >= 0), SEL(id));
    await o.mm.seek(rest('waffle'));
    assert.deepEqual(await lit('waffle'), Array.from({ length: 37 }, (_, i) => i));
    assert.equal(await text(o, 'waffle'), '37');
    await o.mm.seek(rest('corner'));
    const c = await lit('corner');
    assert.equal(c.length, 20);
    assert.ok(c.includes(99) && !c.includes(0), 'lit from the bottom right');
    await o.mm.seek(rest('isotype'));
    assert.equal((await lit('isotype')).length, 7);
    await o.mm.seek(rest('pictobar'));
    const bar = await o.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .mm-ug__unit[data-lit]`)].map((u) => u.style.getPropertyValue('--mm-ug-part')), SEL('pictobar'));
    assert.equal(bar.length, 5, 'four whole units and a part one');
    assert.equal(bar.filter(Boolean).length, 1);
    assert.equal(await text(o, 'pictobar'), '4.5');
  } finally { await o.close(); }
});

test('waterfall: bars start where the last one ended, the total is the sum on the accent, a wrong given total is reported', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('waterfall'));
    const r = await o.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const bars = [...el.querySelectorAll('.mm-wf__bar')];
      const total = bars.at(-1), accent = (() => { const d = document.createElement('i'); d.style.color = 'var(--mm-color-accent)'; el.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
      return { n: bars.length, tops: bars.map((b) => Number.parseFloat(b.style.top)), totalColor: getComputedStyle(total).backgroundColor, accent, figures: [...el.querySelectorAll('.mm-wf__figure')].map((f) => f.textContent), names: [...el.querySelectorAll('.mm-wf__name')].map((n) => n.textContent) };
    }, SEL('waterfall'));
    assert.equal(r.n, 4);
    assert.deepEqual(r.figures, ['100', '+45', '−30', '115']);
    assert.equal(r.totalColor, r.accent);
    assert.deepEqual(r.names, ['A', 'B', 'C', 'Total']);
    assert.ok((await o.mm.meta()).warnings.some((w) => /data\/waterfall value 120 is not the sum/.test(w)), 'the given 120 is not the sum 115');
  } finally { await o.close(); }
});

test('bubble: the big circle\'s area is the value over the reference\'s', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('bubble'));
    const [big, ref] = await o.page.evaluate((sel) => [...document.querySelectorAll(`${sel} circle`)].map((c) => Number(c.getAttribute('r'))), SEL('bubble'));
    assert.ok(Math.abs((big * big) / (ref * ref) - 4) < 1e-6, `${big} ${ref}`);
    assert.equal(await o.page.evaluate((s) => document.querySelector(`${s} .mm-bubble__figure`).textContent, SEL('bubble')), '400');
  } finally { await o.close(); }
});

test('versus: before and after read their figures, the after is the larger', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('versus'));
    const r = await o.page.evaluate((sel) => { const f = (k) => document.querySelector(`${sel} .mm-versus__side--${k} .mm-versus__figure`); return { b: f('before').textContent, a: f('after').textContent, bs: Number.parseFloat(getComputedStyle(f('before')).fontSize), as: Number.parseFloat(getComputedStyle(f('after')).fontSize), axis: document.querySelector(sel).dataset.axis }; }, SEL('versus'));
    assert.deepEqual([r.b, r.a], ['42', '87']);
    assert.ok(r.as > r.bs * 1.4, `${r.as} against ${r.bs}`);
    assert.equal(r.axis, 'down', 'a tall frame stacks them');
  } finally { await o.close(); }
  const w = await open('16x9');
  try {
    await w.mm.seek(rest('versus'));
    assert.equal(await w.page.evaluate((s) => document.querySelector(s).dataset.axis, SEL('versus')), 'across');
  } finally { await w.close(); }
});

test('delta: a sign, a caret and the value; good news takes the accent whichever way it points', async () => {
  const o = await open();
  try {
    await o.mm.seek(rest('delta'));
    assert.equal(await text(o, 'delta'), '+12.4%');
    const up = await o.page.evaluate((s) => ({ good: document.querySelector(s).dataset.good, dir: document.querySelector(s).dataset.dir }), SEL('delta'));
    assert.deepEqual(up, { good: 'true', dir: 'up' });
    await o.mm.seek(rest('deltadown'));
    assert.equal(await text(o, 'deltadown'), '−8%');
    const down = await o.page.evaluate((s) => ({ good: document.querySelector(s).dataset.good, dir: document.querySelector(s).dataset.dir }), SEL('deltadown'));
    assert.deepEqual(down, { good: 'true', dir: 'down' });
  } finally { await o.close(); }
});

test('object-card: the brand\'s variant reaches the layout unless a beat sets one', async () => {
  const o = await open();
  try {
    const info = (id) => o.page.evaluate((sc) => {
      const root = document.querySelector(`[data-scene="${sc}"] .object-card`);
      const rings = getComputedStyle(root.querySelector('.object-card__rings')).display;
      return { rootVariant: root.getAttribute('data-p-variant'), rings, slotVariant: root.querySelector('[data-p-variant]')?.getAttribute('data-p-variant') ?? null };
    }, id);
    await o.mm.seek(rest('card'));
    const a = await info('card');
    assert.equal(a.rootVariant, 'calendar', 'the brand\'s default is on the layout root');
    assert.equal(a.rings, 'flex', 'a calendar has rings');
    await o.mm.seek(rest('cardbeat'));
    const b = await info('cardbeat');
    assert.equal(b.rootVariant, null, 'a beat that sets the variant keeps the brand\'s off the root');
    assert.equal(b.slotVariant, 'tag');
    assert.equal(b.rings, 'none');
  } finally { await o.close(); }
});

test('swing: hangs level at rest and is tilted while it swings', async () => {
  const o = await open();
  try {
    const rotate = () => o.page.evaluate((s) => document.querySelector(s).style.rotate, SEL('swing'));
    await o.mm.seek(rest('swing'));
    assert.equal(await rotate(), 'none');
    await o.mm.seek(startOf('swing') + 0.3 + 0.1);
    assert.notEqual(await rotate(), 'none');
    assert.ok(Math.abs(Number.parseFloat(await rotate())) > 1);
  } finally { await o.close(); }
});

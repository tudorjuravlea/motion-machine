// The effects library: each
// effect mid-way is visibly the effect, and at its end the slot is plain text with nothing left
// behind, so the legibility checks read real type. Story: tests/kit/media/effects.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '9x16', preset = 'editorial') => openPiece(PAGE, { server, browser, format, query: { story: 'effects', preset } });
const itemOf = (sched, scene, slot) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === slot);
// seek to fraction q of a beat's entrance (or of its emphasis, kind 'emphasis') and run fn(slot)
async function at(o, scene, slot, q, fn, kind = 'entrance') {
  const it = itemOf((await o.mm.meta()).schedule, scene, slot);
  const span = kind === 'emphasis' ? it.emphasis : { start: it.start, d: it.d };
  await o.mm.seek(span.start + q * span.d);
  return o.page.evaluate(([sc, sl, src]) => {
    const el = document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`);
    return (0, eval)(`(${src})`)(el);
  }, [scene, slot, fn.toString()]);
}
// what a plain slot looks like: its text, and whether any descendant carries an inline style
const plain = (el) => ({
  text: el.textContent.replace(/\s+/g, ' ').trim(),
  styled: [el, ...el.querySelectorAll('*')].filter((n) => n.getAttribute('style') && /clip|transform|filter|stretch|background|translate|scale|rotate/.test(n.getAttribute('style'))).length,
  nodes: el.querySelectorAll('svg, canvas, .mm-fx').length,
});

test('text/masked-fill: mid-way the fill rises inside the letters with an edge; at 1 plain ink', async () => {
  const o = await open();
  try {
    const mid = await at(o, 'masked', 'headline', 0.45, (el) => {
      const n = el.querySelector('.mm-masked-fill') ?? el;
      const cs = getComputedStyle(n);
      return { clip: cs.webkitBackgroundClip || cs.backgroundClip, fill: cs.webkitTextFillColor, p: n.style.getPropertyValue('--mm-mf-p') };
    });
    assert.equal(mid.clip, 'text', JSON.stringify(mid));
    assert.match(mid.fill, /rgba\(0, 0, 0, 0\)|transparent/);
    assert.ok(Number(mid.p) > 0.2 && Number(mid.p) < 0.9, JSON.stringify(mid));
    const end = await at(o, 'masked', 'headline', 1, plain);
    assert.deepEqual(end, { text: 'Plan the week in one place', styled: 0, nodes: 0 });
    const back = await at(o, 'masked', 'headline', 0.45, (el) => (el.querySelector('.mm-masked-fill') ?? el).style.getPropertyValue('--mm-mf-p'));
    assert.equal(back, mid.p, 'seeking back gives the same state');
  } finally { await o.close(); }
});

for (const preset of ['editorial', 'kinetic']) test(`text/elastic · ${preset}: mid-way the middle letter is wider than the edges and no letter leaves the slot; at 1 plain`, async () => {
  const o = await open('9x16', preset);
  try {
    for (const q of [0.3, 0.6]) assert.equal((await at(o, 'elastic', 'headline', q, (el) => { const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('.mm-elastic__l')].filter((l) => { const r = l.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).length; })), 0, `a letter leaves the slot at ${q}`);
    const mid = await at(o, 'elastic', 'headline', 0.12, (el) => {
      const ls = [...el.querySelectorAll('.mm-elastic__l')];
      const box = el.getBoundingClientRect();
      const w = (n) => { const s = n.style; return Math.max(parseFloat(s.fontStretch) || 100, (parseFloat(s.scale) || 1) * 100); };
      return { n: ls.length, mid: w(ls[Math.floor(ls.length / 2)]), first: w(ls[0]), last: w(ls[ls.length - 1]),
        out: ls.filter((l) => { const r = l.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).length };
    });
    assert.ok(mid.n >= 18, JSON.stringify(mid));
    assert.ok(mid.mid > mid.first + 3 && mid.mid > mid.last + 3, JSON.stringify(mid));
    assert.equal(mid.out, 0, JSON.stringify(mid));
    assert.deepEqual(await at(o, 'elastic', 'headline', 1, plain), { text: 'Stretch the whole line', styled: 0, nodes: 0 });
  } finally { await o.close(); }
});

test('entrances/slats: mid-way the slot shows through staggered slats (earlier slats wider); at 1 no mask', async () => {
  const o = await open();
  try {
    const mid = await at(o, 'slats', 'headline', 0.5, (el) => el.style.maskImage || el.style.webkitMaskImage || '');
    assert.match(mid, /linear-gradient/);
    const pct = [...mid.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
    // stops come in [start, open edge, open edge, next start] per slat: slat 1 is more open than the last
    const n = pct.length / 4, w = (i) => pct[i * 4 + 1] - pct[i * 4];
    assert.ok(n >= 5 && w(0) > w(n - 1), mid);
    assert.equal(await at(o, 'slats', 'headline', 1, (el) => el.style.maskImage || el.style.webkitMaskImage || ''), '');
  } finally { await o.close(); }
});

test('emphasis/marker-circle: a ring is traced around the slot mid-way; nothing at 0 or 1', async () => {
  const o = await open();
  try {
    const ring = (el) => { const p = el.querySelector('svg.mm-marker-circle path'); if (!p) return null;
      const rg = document.createRange(); rg.selectNodeContents(el.querySelector('svg').previousSibling ?? el);
      const b = rg.getBoundingClientRect(), r = p.getBoundingClientRect();
      return { off: parseFloat(p.style.strokeDashoffset), len: parseFloat(p.style.strokeDasharray), around: r.left < b.left && r.right > b.right && r.top < b.top + b.height / 2 && r.bottom > b.top + b.height / 2 }; };
    const early = await at(o, 'marker', 'headline', 0.2, ring, 'emphasis');
    assert.ok(early && early.off > 0 && early.off < early.len, JSON.stringify(early));
    const mid = await at(o, 'marker', 'headline', 0.6, ring, 'emphasis');
    assert.ok(mid && mid.off === 0 && mid.around, JSON.stringify(mid));
    for (const q of [0, 1]) assert.deepEqual(await at(o, 'marker', 'headline', q, plain, 'emphasis'), { text: 'Ring this one', styled: 0, nodes: 0 });
  } finally { await o.close(); }
});

test('text/date-flip: the old value is struck, then flips away for the new one; at 1 the new value as plain text', async () => {
  const o = await open();
  try {
    const read = (el) => ({ old: el.querySelector('.mm-date-flip__old')?.firstChild?.textContent ?? null, neu: el.querySelector('.mm-date-flip__new')?.textContent ?? null,
      strike: parseFloat(el.querySelector('.mm-date-flip__strike')?.style.scale ?? 'NaN'), oldOp: el.querySelector('.mm-date-flip__old')?.style.opacity, newOp: el.querySelector('.mm-date-flip__new')?.style.opacity });
    const struck = await at(o, 'dateflip', 'headline', 0.3, read);
    assert.equal(struck.old, '2025'); assert.equal(struck.neu, '2027');
    assert.ok(struck.strike > 0.2 && struck.strike < 1, JSON.stringify(struck));
    assert.equal(struck.newOp, '0', 'the new value is hidden while the old one is struck');
    const flipped = await at(o, 'dateflip', 'headline', 0.8, read);
    assert.equal(flipped.oldOp, '0'); assert.equal(flipped.newOp, '');
    assert.deepEqual(await at(o, 'dateflip', 'headline', 1, plain), { text: '2027', styled: 0, nodes: 0 });
  } finally { await o.close(); }
});

// a layout at its scene's rest: each slot's text, whether it shows, its box and its rotation
async function restOf(o, scene) {
  const { schedule } = await o.mm.meta();
  await o.mm.seek(schedule.scenes.find((s) => s.id === scene).end - 0.05);
  return o.page.evaluate((sc) => Object.fromEntries([...document.querySelectorAll(`[data-scene="${sc}"] [data-slot]`)].map((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return [el.dataset.slot, { text: el.textContent.trim(), shown: cs.display !== 'none' && cs.visibility !== 'hidden', bg: cs.backgroundColor, rotate: cs.rotate, box: [r.left, r.top, r.right, r.bottom].map(Math.round) }];
  })), scene);
}

for (const format of ['9x16', '16x9', '1x1']) test(`layouts/grid-break · ${format}: identical tiles, one odd tile in another fill, an empty tile hidden, nothing rotated`, async () => {
  const o = await open(format);
  try {
    const s = await restOf(o, 'gridbreak');
    assert.equal(s['tile-1'].text, 'Meeting'); assert.equal(s.odd.text, 'Focus');
    assert.equal(s['tile-5'].shown, false, 'a tile with no beat is hidden');
    assert.equal(s['tile-1'].bg, s['tile-4'].bg); assert.notEqual(s.odd.bg, s['tile-1'].bg);
    assert.ok(['none', '0deg'].includes(s.odd.rotate), s.odd.rotate);
    const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
    assert.ok(area(s.odd.box) > area(s['tile-1'].box), 'the odd tile sits larger');
  } finally { await o.close(); }
});

for (const format of ['9x16', '16x9']) test(`layouts/paper-cards · ${format}: cards carry a torn-edge mask, an empty card leaves the flow`, async () => {
  const o = await open(format);
  try {
    const s = await restOf(o, 'paper');
    assert.equal(s['card-1'].text, 'Ask before you build'); assert.equal(s['card-3'].shown, false);
    const mask = await o.page.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-scene="paper"] [data-slot="card-1"]')); return c.maskImage || c.webkitMaskImage; });
    assert.match(mask, /conic-gradient/);
    assert.ok(['none', '0deg'].includes(s['card-2'].rotate));
  } finally { await o.close(); }
});

// the laid-out text's box inside a slot, and a child's box, in page pixels
const textBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); const rs = [...r.getClientRects()].filter((x) => x.width > 0 && !x.height === false);
  return { l: Math.min(...rs.map((x) => x.left)), r: Math.max(...rs.map((x) => x.right)) }; };

test('emphasis/stretch-pill: the pill stretches in ahead of itself, sits behind the words, then leaves; nothing at 0 or 1', async () => {
  const o = await open();
  try {
    const read = (el) => { const p = el.querySelector('.mm-stretch-pill'); if (!p) return null; const b = p.getBoundingClientRect();
      const g = document.createRange(); g.selectNodeContents(el.lastChild); const t = g.getBoundingClientRect(); return { pl: b.left, pr: b.right, tl: t.left, tr: t.right }; };
    const early = await at(o, 'pill', 'headline', 0.12, read, 'emphasis');
    assert.ok(early && early.pr > early.tl && early.pr < early.tr - 20, `the pill is on its way in, its leading edge ahead: ${JSON.stringify(early)}`);
    const hold = await at(o, 'pill', 'headline', 0.5, read, 'emphasis');
    assert.ok(hold.pl < hold.tl && hold.pr > hold.tr, `the pill covers the words: ${JSON.stringify(hold)}`);
    const late = await at(o, 'pill', 'headline', 0.85, read, 'emphasis');
    assert.ok(late.pl > hold.pl + 5, `the trailing edge has moved on: ${JSON.stringify(late)}`);
    for (const q of [0, 1]) assert.deepEqual(await at(o, 'pill', 'headline', q, plain, 'emphasis'), { text: 'Pick a plan', styled: 0, nodes: 0 });
    assert.equal(await at(o, 'pill', 'headline', 1, (el) => el.querySelectorAll('span').length, 'emphasis'), 0);
  } finally { await o.close(); }
});

test('emphasis/brackets: four corners snap in around the words, then the element lifts; nothing at 0 or 1', async () => {
  const o = await open();
  try {
    const read = (el) => ({ n: el.querySelectorAll('.mm-brackets').length, scale: el.style.scale, op: el.querySelector('.mm-brackets')?.style.opacity });
    const snap = await at(o, 'brackets', 'headline', 0.15, read, 'emphasis');
    assert.equal(snap.n, 4); assert.ok(Number(snap.op) > 0.3, JSON.stringify(snap));
    const lifted = await at(o, 'brackets', 'headline', 0.6, read, 'emphasis');
    assert.ok(Number(lifted.scale) > 1.02, JSON.stringify(lifted));
    for (const q of [0, 1]) assert.deepEqual(await at(o, 'brackets', 'headline', q, (el) => ({ n: el.querySelectorAll('.mm-brackets').length, scale: el.style.scale }), 'emphasis'), { n: 0, scale: '' });
  } finally { await o.close(); }
});

test('emphasis/lens: the other items soften and dim, the focused one grows and gets a rim; nothing at 0 or 1', async () => {
  const o = await open();
  try {
    const read = (el) => { const sib = el.parentElement.querySelector('[data-slot="item-1"]');
      return { sibFilter: sib.style.filter, sibOp: sib.style.opacity, scale: el.style.scale, rim: !!el.querySelector('.mm-lens'), selfFilter: el.style.filter }; };
    const mid = await at(o, 'lens', 'item-2', 0.5, read, 'emphasis');
    assert.match(mid.sibFilter, /blur\(/); assert.ok(Number(mid.sibOp) < 0.7, JSON.stringify(mid));
    assert.ok(Number(mid.scale) > 1.03 && mid.rim && mid.selfFilter === '', JSON.stringify(mid));
    for (const q of [0, 1]) assert.deepEqual(await at(o, 'lens', 'item-2', q, read, 'emphasis'), { sibFilter: '', sibOp: '', scale: '', rim: false, selfFilter: '' });
  } finally { await o.close(); }
});

test('data/bar-to-line: bars grow, then become dots on their tops while a line is drawn through them; the value never passes its fact', async () => {
  const o = await open();
  try {
    const read = (el) => { const bars = [...el.querySelectorAll('.mm-b2l__bar')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top }; });
      const line = el.querySelector('.mm-b2l__line polyline'); return { bars, off: line ? Number(line.style.strokeDashoffset) : null, value: el.querySelector('.mm-b2l__value')?.textContent };
    };
    const grown = await at(o, 'b2l', 'headline', 0.42, read);
    assert.equal(grown.bars.length, 5); assert.ok(grown.bars[4].h > grown.bars[0].h * 2 && grown.bars[4].h > grown.bars[4].w, JSON.stringify(grown.bars));
    assert.equal(grown.off, 1, 'no line yet');
    const done = await at(o, 'b2l', 'headline', 1, read);
    assert.ok(done.bars.every((b) => Math.abs(b.w - b.h) < 1 && b.w < 40), `every bar is now a dot: ${JSON.stringify(done.bars)}`);
    assert.ok(done.bars[4].top < done.bars[0].top, 'the last dot sits higher than the first');
    assert.equal(done.off, 0); assert.equal(done.value, '82');
    const mid = await at(o, 'b2l', 'headline', 0.75, read);
    assert.ok(mid.off > 0 && mid.off < 1, 'the line is drawing'); assert.equal(mid.value, '82');
  } finally { await o.close(); }
});

for (const format of ['9x16', '16x9']) test(`layouts/fan-stack · ${format}: each card's label stays clear of the card in front; the front card is largest`, async () => {
  const o = await open(format);
  try {
    const s = await restOf(o, 'fan');
    const clear = await o.page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-scene="fan"] [data-slot^="card-"]')];
      return cards.slice(0, -1).map((c, i) => { const r = document.createRange(); r.selectNodeContents(c); const t = r.getBoundingClientRect(); const next = cards[i + 1].getBoundingClientRect(); return t.bottom <= next.top + 1; });
    });
    assert.deepEqual(clear, [true, true, true]);
    const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
    assert.ok(area(s['card-4'].box) > area(s['card-1'].box)); assert.equal(s['card-4'].text, 'Your launch plan is ready');
  } finally { await o.close(); }
});

test('data/flow: curves draw, pulses travel from the source to each middle node and on to the sink, nodes ring on arrival; at 1 the still diagram', async () => {
  const o = await open();
  try {
    const read = (el) => ({ labels: [...el.querySelectorAll('.mm-flow__node')].map((n) => n.textContent), pulses: [...el.querySelectorAll('.mm-flow__pulse')].map((c) => Number(c.getAttribute('cx'))),
      rings: el.querySelectorAll('.mm-flow__ring').length, offs: [...el.querySelectorAll('.mm-flow__edge')].map((e) => Number(e.style.strokeDashoffset)),
      xs: [...el.querySelectorAll('.mm-flow__node')].map((n) => n.getBoundingClientRect().left) });
    const first = await at(o, 'flow', 'headline', 0.58, read);
    assert.deepEqual(first.labels, ['Brief', 'Design', 'Build', 'Test', 'Launch']);
    assert.equal(first.pulses.length, 3, JSON.stringify(first));
    const second = await at(o, 'flow', 'headline', 0.88, read);
    assert.ok(second.pulses.length === 3 && Math.min(...second.pulses) > Math.max(...first.pulses), JSON.stringify(second));
    assert.equal((await at(o, 'flow', 'headline', 0.74, read)).rings, 3, 'the middle nodes ring as their pulses land');
    assert.equal((await at(o, 'flow', 'headline', 0.97, read)).rings, 1, 'the sink rings last');
    const done = await at(o, 'flow', 'headline', 1, read);
    assert.equal(done.pulses.length, 0); assert.equal(done.rings, 0);
    assert.equal(done.offs.length, 6); assert.ok(done.offs.every((x) => x === 0));
    assert.ok(done.xs[0] < done.xs[1] && done.xs[1] < done.xs[4], 'source left of the middle, sink right');
  } finally { await o.close(); }
});

test('moves/explode-layers: the scene tilts and its layers part in depth mid-scene; flat at both ends', async () => {
  const o = await open('16x9');
  try {
    const { schedule } = await o.mm.meta();
    const sc = schedule.scenes.find((s) => s.id === 'explode');
    const read = async (q) => { await o.mm.seek(sc.start + q * (sc.end - sc.start)); return o.page.evaluate(() => {
      const cam = document.querySelector('[data-scene="explode"] .mm-camera');
      return { cam: cam.style.transform, z: [...cam.querySelectorAll('[data-slot]')].map((s) => s.style.transform) }; }); };
    const mid = await read(0.55);
    assert.match(mid.cam, /rotateX\(-?[1-9]/, mid.cam);
    const zs = mid.z.map((t) => Number((t.match(/translateZ\((-?[\d.]+)px\)/) ?? [0, 'NaN'])[1]));
    assert.ok(zs.every(Number.isFinite) && Math.max(...zs) - Math.min(...zs) > 100, JSON.stringify(mid.z));
    for (const q of [0.02, 0.995]) { const e = await read(q); assert.ok(!/rotate[XY]\(-?[1-9]/.test(e.cam), `flat at ${q}: ${e.cam}`); }
  } finally { await o.close(); }
});

test('entrances/assemble: dots on a declared-media canvas gather into the words, the same dots at every seek; at 1 plain text', async () => {
  const o = await open();
  try {
    const read = (el) => { const c = el.querySelector('canvas'); if (!c) return null;
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0, h = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { ink++; h = (h * 31 + i) >>> 0; }
      return { media: c.hasAttribute('data-media'), ink, h, text: getComputedStyle(el.querySelector('.mm-assemble__text')).opacity }; };
    const a = await at(o, 'assemble', 'headline', 0.4, read);
    assert.ok(a && a.media && a.ink > 200, JSON.stringify(a)); assert.equal(a.text, '0');
    await at(o, 'assemble', 'headline', 0.9, read);
    assert.deepEqual(await at(o, 'assemble', 'headline', 0.4, read), a, 'the same dots after seeking away and back');
    assert.deepEqual(await at(o, 'assemble', 'headline', 1, plain), { text: 'Made of parts', styled: 0, nodes: 0 });
  } finally { await o.close(); }
});

test('every new text entrance is plain at its scene\'s rest instant (the gate samples there, rounded to the millisecond)', async () => {
  const o = await open();
  try {
    const { schedule } = await o.mm.meta();
    const bad = [];
    for (const [scene, text] of [['masked', 'Plan the week in one place'], ['elastic', 'Stretch the whole line'], ['dateflip', '2027'], ['assemble', 'Made of parts']]) {
      const it = itemOf(schedule, scene, 'headline');
      const hold = schedule.holds.find((h) => h.scene === scene);
      await o.mm.seek(hold.from);
      const r = await o.page.evaluate(([sc, src]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="headline"]`)), [scene, plain.toString()]);
      if (JSON.stringify(r) !== JSON.stringify({ text, styled: 0, nodes: 0 })) bad.push(`${scene}: ${JSON.stringify(r)}`);
    }
    assert.deepEqual(bad, []);
  } finally { await o.close(); }
});

// ---- seek determinism ----

test('moves/explode-layers draws the same pixels at an instant whatever was seeked before', async () => {
  const o = await open('16x9');
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'explode');
    const at = (q) => sc.start + q * (sc.end - sc.start);
    await o.mm.seek(at(0.05)); const fresh = await o.page.screenshot();
    await o.mm.seek(at(0.55)); await o.mm.seek(at(0.05)); const after = await o.page.screenshot();
    assert.ok(fresh.equals(after), 'the flat frame changed after the scene was seen mid-move');
    const left = await o.page.evaluate(() => [...document.querySelectorAll('[data-scene="explode"] .mm-camera *')].filter((n) => n.style.transformStyle || (n.matches('[data-empty]') && n.style.transform)).length);
    assert.equal(left, 0, 'no 3D style left on wrappers or empty slots');
  } finally { await o.close(); }
});

test('data patterns leave no class on their slot, so a hidden slot keeps its size', async () => {
  const o = await open();
  try {
    const { schedule } = await o.mm.meta();
    for (const scene of ['b2l', 'flow']) {
      const it = itemOf(schedule, scene, 'headline');
      const cls = async () => { await o.mm.seek(it.start - 0.05); return o.page.evaluate((sc) => document.querySelector(`[data-scene="${sc}"] [data-slot="headline"]`).className, scene); };
      const fresh = await cls(); await o.mm.seek(it.start + it.d); assert.equal(await cls(), fresh, scene);
    }
  } finally { await o.close(); }
});

test('emphasis/lens dims every filled sibling whatever their order in the story', async () => {
  const o = await open();
  try {
    const ops = await at(o, 'lens2', 'item-2', 0.5, (el) => [...el.parentElement.querySelectorAll(':scope > [data-slot]:not([data-empty])')].filter((s) => s !== el).map((s) => [s.dataset.slot, Number(getComputedStyle(s).opacity)]), 'emphasis');
    assert.ok(ops.every(([, x]) => x < 0.7), JSON.stringify(ops));
  } finally { await o.close(); }
});

test('bar-to-line\'s dots sit on the line even when fewer labels than values are given', async () => {
  const o = await open();
  try {
    const off = await at(o, 'b2l8', 'headline', 1, (el) => {
      const line = el.querySelector('polyline'), svg = line.ownerSVGElement.getBoundingClientRect();
      const pts = line.getAttribute('points').split(' ').map((p) => p.split(',').map(Number));
      return [...el.querySelectorAll('.mm-b2l__bar')].map((b, i) => { const r = b.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - (svg.top + pts[i][1])); });
    });
    assert.ok(off.every((d) => d < 2), JSON.stringify(off));
  } finally { await o.close(); }
});

test('masked-fill rises in the slot\'s own text colour (an accent-ink tile), not in ink', async () => {
  const o = await open();
  try {
    const r = await at(o, 'maskodd', 'odd', 0.5, (el) => ({ fill: getComputedStyle(el.querySelector('.mm-masked-fill')).getPropertyValue('--mm-mf-fill').trim(), own: getComputedStyle(el).color }));
    assert.equal(r.fill, r.own);
  } finally { await o.close(); }
});

test('3d/particles-to-shape: a declared 3D canvas of particles gathers into the words, the same pixels at every seek; at 1 plain text', async () => {
  const o = await open();
  try {
    const shot = (el) => { const c = el.querySelector('canvas[data-3d]'); if (!c) return null;
      const g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0);
      const px = x.getImageData(0, 0, g.width, g.height).data; let ink = 0, h = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) { ink++; h = (h * 31 + i + px[i - 1]) >>> 0; }
      return { media: c.hasAttribute('data-media'), ink, h, text: getComputedStyle(el.querySelector('.mm-p3d__text')).opacity }; };
    const a = await at(o, 'p3d', 'headline', 0.45, shot);
    assert.ok(a && a.media && a.ink > 300, JSON.stringify(a)); assert.equal(a.text, '0');
    await at(o, 'p3d', 'headline', 0.9, shot);
    assert.deepEqual(await at(o, 'p3d', 'headline', 0.45, shot), a, 'the same particles after seeking away and back');
    assert.deepEqual(await at(o, 'p3d', 'headline', 1, plain), { text: 'Built to last', styled: 0, nodes: 0 });
  } finally { await o.close(); }
});

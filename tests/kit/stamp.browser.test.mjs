// emphasis/stamp: a verdict word stamped onto the frame. Its look (a double-ruled plate in one
// palette role, pitted, tilted, around level type) is the slot's own style, so it holds at every rest;
// the emphasis plays the slam: the stamp comes down from large and faint, lands, wobbles out, the
// rest of the frame flashes once in the lightest role (at most half strength) and the neighbours jolt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'stamp-test');
const FORMATS4 = ['9x16', '1x1', '4x5', '16x9'];
const story = (params = {}, { text = 'Approved', formats = ['9x16', '16x9'], base = { instant: true, size: 'h2' } } = {}) => ({
  id: 'stamp-test', kind: 'film', formats, title: 'stamp test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{
    id: 's', layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'The plan' },
      { at: 1, slot: 'sub', fx: 'entrances/fade', text, params: { ...base, ...params }, emphasis: 'emphasis/stamp' },
    ],
  }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const [name, brand, params, opts] of [
    ['paper', 'paper', {}], ['nocturne', 'nocturne', { tone: 'ink', tilt: 'right' }], ['press', 'paper', { personality: 'press' }],
    // a long verdict at the default h1, in every format
    ['long', 'nocturne', {}, { text: 'Non-negotiable', formats: FORMATS4, base: { instant: true } }],
    ['longpaper', 'paper', {}, { text: 'Non-negotiable', formats: FORMATS4, base: { instant: true } }],
    // the demo's word at the default h1, in every format: the slam's start scale
    ['h1', 'nocturne', {}, { formats: FORMATS4, base: { instant: true } }],
    // a stamp beat without instant: true
    ['noinstant', 'paper', {}, { formats: FORMATS4, base: {} }],
    // words too long for the column at the body floor, at h1 and at h2
    ['giant', 'nocturne', {}, { text: 'Antidisestablishmentarianism', formats: FORMATS4, base: { instant: true } }],
    ['giant2', 'nocturne', {}, { text: 'Supercalifragilisticexpialidociousness', formats: FORMATS4, base: { instant: true, size: 'h2' } }],
  ]) {
    const dir = join(OUT, name), style = join(OUT, `${name}.style.json`);
    rmSync(dir, { recursive: true, force: true });
    composeToFile({ brand, motion: 'kinetic', out: style });
    newPiece({ kind: 'film', style, dir });
    writeFileSync(join(dir, 'story.json'), JSON.stringify(story(params, opts), null, 2));
    dirs[name] = dir;
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const SUB = '[data-scene="s"] [data-slot="sub"]', HEAD = '[data-scene="s"] [data-slot="headline"]';
const probe = (o) => o.page.evaluate(([sub, head]) => {
  const el = document.querySelector(sub), cs = getComputedStyle(el), pl = getComputedStyle(el, '::before');
  const root = getComputedStyle(document.documentElement);
  const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const roles = Object.fromEntries(['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'].map((r) => [r, rgb(root.getPropertyValue(`--mm-color-${r}`).trim())]));
  return {
    roles, color: cs.color, opacity: Number(cs.opacity), visibility: cs.visibility,
    transform: cs.transform, scale: cs.scale, rotate: cs.rotate, translate: cs.translate,
    plate: { content: pl.content, rotate: pl.rotate, border: pl.borderTopColor, borderW: parseFloat(pl.borderTopWidth), outline: pl.outlineColor, mask: pl.maskImage },
    shadow: el.style.boxShadow, head: getComputedStyle(document.querySelector(head)).translate,
  };
}, [SUB, HEAD]);
const emphasisOf = async (o) => (await o.mm.meta()).schedule.items.find((it) => it.selector === SUB).emphasis;

test('at rest the stamp is level type in one palette role on a tilted, pitted plate of the same role', async () => {
  for (const name of ['paper', 'nocturne']) {
    for (const format of ['9x16', '16x9']) {
      const o = await openPiece(dirs[name], { server, browser, format });
      try {
        const e = await emphasisOf(o);
        assert.ok(e && e.d > 0, 'the beat has an emphasis');
        await o.mm.seek(e.start + e.d + 0.3);
        const s = await probe(o);
        const want = name === 'nocturne' ? s.roles.ink : s.roles.accent;
        assert.equal(s.color, want, `${name} ${format}: the word is in the ${name === 'nocturne' ? 'ink' : 'accent'} role`);
        assert.equal(s.opacity, 1);
        for (const k of ['transform', 'scale', 'rotate', 'translate']) assert.equal(s[k], 'none', `${name} ${format}: the type is level and unmoved at rest (${k} ${s[k]})`);
        assert.equal(s.shadow, '', 'no flash at rest');
        assert.notEqual(s.plate.content, 'none', 'the plate is drawn');
        const deg = parseFloat(s.plate.rotate);
        assert.ok(Math.abs(deg) >= 4 && Math.abs(deg) <= 10, `the plate is tilted 4 to 10 degrees: ${s.plate.rotate}`);
        if (name === 'nocturne') assert.ok(deg > 0, 'tilt: right turns it clockwise');
        assert.equal(s.plate.border, want, 'the plate rule is the same role');
        assert.equal(s.plate.outline, want, 'the inner rule is the same role');
        assert.ok(s.plate.borderW >= 2, `a heavy outer rule: ${s.plate.borderW}`);
        assert.match(s.plate.mask, /radial-gradient/, 'the plate is pitted by a mask, which shows the ground through: no new colour');
      } finally { await o.close(); }
    }
  }
});

test('the slam: from large and faint to level and whole, inside the safe area, then a capped flash in the lightest role', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const e = await emphasisOf(o);
    await o.mm.seek(e.start);
    let s = await probe(o);
    assert.ok(parseFloat(s.scale) > 1.2 && parseFloat(s.scale) <= 2.6, `starts large, at most 2.6×: ${s.scale}`);
    assert.ok(s.opacity < 0.5, `starts faint: ${s.opacity}`);
    const ink = await o.page.evaluate((sel) => {
      const el = document.querySelector(sel), rg = document.createRange(); rg.selectNodeContents(el);
      const r = rg.getBoundingClientRect(), m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, m };
    }, SUB);
    assert.ok(ink.l >= ink.m - 1 && ink.r <= 1080 - ink.m + 1 && ink.t >= ink.m - 1 && ink.b <= 1920 - ink.m + 1, `the scaled word stays inside the safe area: ${JSON.stringify(ink)}`);
    await o.mm.seek(e.start + 0.1);
    s = await probe(o);
    assert.ok(s.opacity > 0.99, 'landed whole');
    assert.match(s.shadow, /color-mix/, `a flash right after the landing: ${s.shadow}`);
    const pct = Number(/(\d+(?:\.\d+)?)%/.exec(s.shadow)?.[1]);
    assert.ok(pct > 0 && pct <= 50, `the flash is at most half strength: ${pct}`);
    assert.match(s.shadow, /--mm-color-surface|--mm-color-accentInk/, 'the flash is the lightest role');
    assert.notEqual(s.head, 'none', 'the neighbour jolts');
    await o.mm.seek(e.start + 0.4);
    s = await probe(o);
    assert.equal(s.shadow, '', 'the flash is over within a quarter second');
  } finally { await o.close(); }
});

test('press is the quieter personality: a small start, no wobble past the landing', async () => {
  const o = await openPiece(dirs.press, { server, browser, format: '9x16' });
  try {
    const e = await emphasisOf(o);
    await o.mm.seek(e.start);
    const s0 = await probe(o);
    assert.ok(parseFloat(s0.scale) > 1.05 && parseFloat(s0.scale) < 1.25, `a small start: ${s0.scale}`);
    for (const dt of [0.1, 0.2, 0.3]) {
      await o.mm.seek(e.start + dt);
      const s = await probe(o);
      assert.ok(s.scale === 'none' || Math.abs(parseFloat(s.scale) - 1) < 1e-6, `still after landing at +${dt}: ${s.scale}`);
    }
  } finally { await o.close(); }
});

test('same instant, same frame, in any seek order', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '16x9' });
  try {
    const e = await emphasisOf(o);
    const ts = [e.start + 0.02, e.start + 0.08, e.start + 0.2];
    const shots = [];
    for (const t of ts) { await o.mm.seek(t); shots.push(await o.page.screenshot({ type: 'png', animations: 'disabled' })); }
    for (const [i, t] of [...ts.entries()].reverse()) { await o.mm.seek(t); assert.equal(Buffer.compare(await o.page.screenshot({ type: 'png', animations: 'disabled' }), shots[i]), 0, `same pixels at ${t}`); }
  } finally { await o.close(); }
});

// the word's text extents and the safe area, in frame pixels
const inkAndSafe = (o) => o.page.evaluate((sel) => {
  const el = document.querySelector(sel), rg = document.createRange(); rg.selectNodeContents(el);
  const r = rg.getBoundingClientRect(), box = el.getBoundingClientRect(), root = getComputedStyle(document.documentElement);
  const v = (n) => parseFloat(root.getPropertyValue(n));
  // how far the ink spills past the slot's own box, sideways (the plate is drawn around the box)
  const over = Math.max(0, box.left - r.left, r.right - box.right);
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, m: v('--mm-safe'), w: v('--mm-frame-w'), h: v('--mm-frame-h'), over };
}, SUB);
const inside = (k, tol = 1) => k.l >= k.m - tol && k.r <= k.w - k.m + tol && k.t >= k.m - tol && k.b <= k.h - k.m + tol;

test('a long verdict at h1 is sized to its room: at rest it sits inside the safe area in every format', async () => {
  for (const name of ['long', 'longpaper']) {
    for (const format of FORMATS4) {
      const o = await openPiece(dirs[name], { server, browser, format });
      try {
        const e = await emphasisOf(o);
        await o.mm.seek(e.start + e.d + 0.3);
        const k = await inkAndSafe(o);
        assert.ok(k.over <= 1, `${name} ${format}: the word stays inside its slot, so inside its plate (${k.over} px out)`);
        assert.ok(inside(k), `${name} ${format}: the word's ink is inside the safe area at rest: ${JSON.stringify(k)}`);
        const s = await probe(o);
        for (const p of ['transform', 'scale', 'rotate', 'translate']) assert.equal(s[p], 'none', `${name} ${format}: still level and unscaled (${p})`);
      } finally { await o.close(); }
    }
  }
});

// the format's body floor (SPEC §12), which G-LEGIBLE holds every rest to
const FLOOR = { '9x16': 44, '1x1': 40, '4x5': 42, '16x9': 36 };
const sized = (o) => o.page.evaluate((sel) => {
  const el = document.querySelector(sel), cs = getComputedStyle(el);
  const r = document.createRange(); r.selectNodeContents(el);
  const tops = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top)));
  const k = el.getBoundingClientRect().width / el.offsetWidth;
  return { px: parseFloat(cs.fontSize) * k, textFit: cs.getPropertyValue('text-fit') || 'none', lines: tops.size, text: el.textContent.replace(/\u00ad/g, ''), raw: el.textContent, inline: el.style.fontSize };
}, SUB);

test('a word too long for the column never renders under the body floor: it is sized in its font size, and breaks in two with a hyphen first', async () => {
  for (const [name, text] of [['giant', 'Antidisestablishmentarianism'], ['giant2', 'Supercalifragilisticexpialidociousness']]) {
    for (const format of FORMATS4) {
      const o = await openPiece(dirs[name], { server, browser, format });
      try {
        const e = await emphasisOf(o);
        await o.mm.seek(e.start + e.d + 0.3);
        const z = await sized(o), k = await inkAndSafe(o);
        assert.equal(z.textFit, 'none', `${name} ${format}: no glyph scaling the gate cannot see`);
        assert.ok(z.px >= FLOOR[format] - 0.01, `${name} ${format}: drawn at ${z.px.toFixed(2)} px, under the body floor of ${FLOOR[format]} px`);
        assert.ok(k.over <= 1, `${name} ${format}: the word stays inside its slot (${k.over} px out)`);
        assert.ok(inside(k), `${name} ${format}: inside the safe area at rest: ${JSON.stringify(k)}`);
        assert.equal(z.text, text, `${name} ${format}: the words are the beat's words`);
        if (z.lines > 1) assert.ok(z.raw.includes('\u00ad'), `${name} ${format}: a word broken across lines breaks at a hyphen`);
        assert.ok(z.lines <= 2, `${name} ${format}: at most two lines (${z.lines})`);
      } finally { await o.close(); }
    }
  }
});

test('a verdict that fits its room is left at its authored size, with no size written', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await openPiece(dirs.paper, { server, browser, format });
    try {
      const e = await emphasisOf(o);
      await o.mm.seek(e.start + e.d + 0.3);
      assert.equal((await sized(o)).inline, '', `${format}: "Approved" at h2 keeps the slot's own size`);
    } finally { await o.close(); }
  }
});

test('the slam starts at 2.6x or at the room around the word, whichever is smaller, in every format', async () => {
  for (const format of FORMATS4) {
    const o = await openPiece(dirs.h1, { server, browser, format });
    try {
      const e = await emphasisOf(o);
      await o.mm.seek(e.start + e.d + 0.3);
      // the room at rest, measured here independently: the largest scale about the word's centre that keeps its ink inside the safe area
      const room = await o.page.evaluate((sel) => {
        const el = document.querySelector(sel), rg = document.createRange(); rg.selectNodeContents(el);
        const r = rg.getBoundingClientRect(), b = el.getBoundingClientRect(), root = getComputedStyle(document.documentElement);
        const m = parseFloat(root.getPropertyValue('--mm-safe')), W = parseFloat(root.getPropertyValue('--mm-frame-w')), H = parseFloat(root.getPropertyValue('--mm-frame-h'));
        const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
        return Math.max(1, Math.min((W - m - cx) / (r.right - cx), (cx - m) / (cx - r.left), (H - m - cy) / (r.bottom - cy), (cy - m) / (cy - r.top)));
      }, SUB);
      await o.mm.seek(e.start);
      const s = await probe(o);
      const start = s.scale === 'none' ? 1 : parseFloat(s.scale);
      const want = Math.min(2.6, room);
      assert.ok(Math.abs(start - want) < 0.02, `${format}: the slam starts at min(2.6, room ${room.toFixed(3)}) = ${want.toFixed(3)}: ${start}`);
    } finally { await o.close(); }
  }
});

test('without instant: true the stamp arrives by its entrance and then lands: no blink, no second slam, and a note in mm.warnings', async () => {
  for (const format of ['9x16', '16x9']) {
    const o = await openPiece(dirs.noinstant, { server, browser, format });
    try {
      const meta = await o.mm.meta();
      const it = meta.schedule.items.find((x) => x.selector === SUB);
      assert.ok(it.d > 0, 'the beat has an entrance');
      const e = it.emphasis;
      let seen = false, worst = 1, big = 1;
      for (let t = it.start; t <= e.start + e.d + 0.1; t += 1 / 60) {
        await o.mm.seek(t);
        const s = await probe(o);
        if (s.visibility === 'hidden') continue;
        if (seen) worst = Math.min(worst, s.opacity);
        if (s.opacity >= 0.99) seen = true;
        if (t >= e.start) big = Math.max(big, s.scale === 'none' ? 1 : parseFloat(s.scale));
      }
      assert.ok(seen, `${format}: the stamp is seen whole`);
      assert.ok(worst >= 0.99, `${format}: once whole it never blinks: lowest opacity after that ${worst}`);
      assert.ok(big <= 1.06, `${format}: no second slam from large: largest scale in the window ${big}`);
      const w = (await o.mm.meta()).warnings.filter((x) => /emphasis\/stamp/.test(x));
      assert.equal(w.length, 1, `${format}: one note for the author: ${JSON.stringify(w)}`);
      assert.match(w[0], /instant: true/);
    } finally { await o.close(); }
  }
  // with instant: true, nothing is said
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const e = await emphasisOf(o);
    await o.mm.seek(e.start + 0.05);
    assert.deepEqual((await o.mm.meta()).warnings.filter((x) => /emphasis\/stamp/.test(x)), [], 'an instant stamp gives no note');
  } finally { await o.close(); }
});

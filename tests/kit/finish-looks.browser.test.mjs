// brand.finish misregister and paper (the print-plates look). The paper is a fibre layer in ink in
// the finish overlay, at or under 0.08 opacity and static: its noise never re-seeds; with grain and
// halftone it adds up to no more than 0.08 over text. The misregister prints the scene's shapes again
// in accent under themselves, offset to one side: a fixed offset per scene, kicked by every emphasis and
// settled before the rest, stepped on the piece's frameHold grid (every 3/30 s under print-plates), so a
// rest is still and the same t draws the same pixels. The plate keeps a 3D camera move in depth, and
// beside type under display size it stays within half a stroke. Story: tests/kit/media/effects.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (preset) => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects', preset } });
// the plate in a scene, as the browser computes it: of every filter in the scene's camera (the camera
// and what it holds), the drop shadow that lies farthest off register; 'none' when there is none
const plate = (o, t, scene) => o.mm.seek(t).then(() => o.page.evaluate((s) => {
  const cam = document.querySelector(`[data-scene="${s}"] > .mm-camera`);
  let best = 'none', far = -1;
  for (const n of [cam, ...cam.querySelectorAll('*')]) {
    const f = getComputedStyle(n).filter, m = /drop-shadow\(\s*rgba?\([^)]*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(f);
    if (m && Math.hypot(Number(m[1]), Number(m[2])) > far) { far = Math.hypot(Number(m[1]), Number(m[2])); best = f; }
  }
  return best;
}, scene));
const offset = (f) => { const m = /drop-shadow\(\s*(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(f); return m && { color: m[1], x: Number(m[2]), y: Number(m[3]) }; };

test('the paper is a static fibre layer in ink at or under 0.08 opacity', async () => {
  const o = await open('print-plates');
  try {
    const seeds = [];
    for (const t of [0.5, 1.03, 2.2, 7.7]) {
      await o.mm.seek(t);
      seeds.push(await o.page.evaluate(() => document.querySelector('#mm-finish-defs #mm-fibre feTurbulence')?.getAttribute('seed')));
    }
    assert.ok(seeds[0] != null && seeds.every((s) => s === seeds[0]), `the fibre never re-seeds: ${seeds}`);
    const r = await o.page.evaluate(() => { const l = document.querySelector('.mm-scene .mm-finish__fibre'); const cs = getComputedStyle(l); return { op: Number(cs.opacity), bg: cs.backgroundColor, ink: getComputedStyle(document.documentElement).getPropertyValue('--mm-color-ink').trim() }; });
    assert.ok(r.op > 0 && r.op <= 0.08, JSON.stringify(r));
    const hex = '#' + r.bg.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    assert.equal(hex.toLowerCase(), r.ink.toLowerCase(), 'fibre in ink');
  } finally { await o.close(); }
});

test('the misregistered plate is the accent, under the shapes, offset down and to one side', async () => {
  const o = await open('print-plates');
  try {
    const f = offset(await plate(o, 3.5, 'masked'));
    assert.ok(f, 'the camera carries the plate');
    const accent = await o.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mm-color-accent').trim());
    const rgb = f.color.match(/[\d.]+/g).map(Number);
    assert.equal('#' + rgb.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join(''), accent.toLowerCase());
    assert.ok(f.y > 0 && Math.hypot(f.x, f.y) > 0.5 && Math.hypot(f.x, f.y) < 12, JSON.stringify(f));
    assert.equal(await o.page.evaluate(() => document.querySelectorAll('.mm-finish [class*="misregister"]').length), 0, 'nothing of it lies over text');
  } finally { await o.close(); }
});

test('an emphasis kicks the plate, stepped every 3/30 s on threes, and it settles before the rest', async () => {
  const o = await open('print-plates');
  try {
    const { schedule } = await o.mm.meta();
    const it = schedule.items.find((x) => x.scene === 'marker' && x.emphasis);
    const e = it.emphasis.start;
    const hold = schedule.holds.find((h) => h.scene === 'marker');
    const base = offset(await plate(o, hold.from + 0.2, 'marker'));
    const kicked = [];
    for (let k = 0; k < 8; k++) kicked.push(offset(await plate(o, (Math.ceil(e * 10 - 1e-6) + k) / 10 + 0.01, 'marker')));
    assert.ok(kicked.some((f) => Math.hypot(f.x - base.x, f.y - base.y) > 8), `kicks: ${JSON.stringify(kicked)} base ${JSON.stringify(base)}`);
    const s = Math.floor(e * 10 + 2) / 10;   // inside one 3/30 s step the plate holds still
    assert.deepEqual(offset(await plate(o, s + 0.005, 'marker')), offset(await plate(o, s + 0.09, 'marker')));
    assert.deepEqual(offset(await plate(o, hold.from + 0.01, 'marker')), base, 'settled at the rest');
    assert.deepEqual(offset(await plate(o, hold.from + 0.4, 'marker')), base);
  } finally { await o.close(); }
});

test('a rest under print-plates draws the same pixels at two instants and after seeking away', async () => {
  const o = await open('print-plates');
  try {
    const hold = (await o.mm.meta()).schedule.holds.find((h) => h.scene === 'masked');
    const shot = async (t) => { await o.mm.seek(t); return o.page.screenshot({ type: 'png' }); };
    const a = await shot(hold.from + 0.1), b = await shot(hold.from + 0.45);
    assert.ok(a.equals(b), 'nothing shimmers in a rest');
    await shot(9.3);
    assert.ok((await shot(hold.from + 0.1)).equals(a), 'the same t, the same pixels');
  } finally { await o.close(); }
});

// every plate the page draws, forced to one value: the plates' own filters stay in place (a filter
// flattens the 3D of what carries it) while what they print can be made invisible
const PLATES = (value) => `* { --mm-plate: ${value} !important; }`;
const diffPx = (a, b) => {
  const A = decodePng(a), B = decodePng(b), ch = A.data.length / (A.width * A.height);
  let n = 0;
  for (let i = 0; i < A.data.length; i += ch) if (Math.max(...[0, 1, 2].map((c) => Math.abs(A.data[i + c] - B.data[i + c]))) > 16) n++;
  return n;
};

test('the plate keeps a 3D camera move in depth: explode-layers parts the layers exactly as with no plate', async () => {
  const o = await open('print-plates');
  try {
    const { schedule } = await o.mm.meta();
    const sc = schedule.scenes.find((s) => s.id === 'explode');
    const holds = schedule.holds.filter((h) => ['masked', 'marker', 'gridbreak', 'paper', 'explode'].includes(h.scene));
    for (const t of [sc.start + 0.5 * (sc.end - sc.start), sc.start + 0.6 * (sc.end - sc.start), ...holds.map((h) => h.from + 0.1)]) {
      const shot = async (css) => {
        const tag = await o.page.addStyleTag({ content: css });
        await o.mm.seek(t);
        const png = await o.page.screenshot({ type: 'png' });
        await tag.evaluate((n) => n.remove());
        return png;
      };
      const plated = await shot(PLATES('drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))')), bare = await shot(PLATES('none'));
      assert.ok(diffPx(plated, bare) < 50, `t ${t.toFixed(2)}: ${diffPx(plated, bare)} px differ between an invisible plate and none`);
    }
  } finally { await o.close(); }
});

test('text under display size takes a plate offset of at most 0.05 of its font size, so a body line never reads doubled; shapes and display type keep the full offset', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'effects', preset: 'print-plates' } });
  try {
    const { schedule } = await o.mm.meta();
    let full = 0;
    for (const h of schedule.holds) {
      await o.mm.seek(h.from + 0.1);
      const r = await o.page.evaluate((scene) => {
        const cam = document.querySelector(`[data-scene="${scene}"] > .mm-camera`);
        const off = (el) => { for (let n = el; n; n = n.parentElement) { const m = /drop-shadow\(\s*rgba?\([^)]*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(getComputedStyle(n).filter); if (m) return Math.hypot(Number(m[1]), Number(m[2])); if (n === cam) break; } return 0; };
        const texts = [];
        const walk = document.createTreeWalker(cam, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('svg')) texts.push({ size: parseFloat(getComputedStyle(n.parentElement).fontSize), off: off(n.parentElement), text: n.textContent.trim().slice(0, 24) });
        const all = [...cam.querySelectorAll('*')].map((n) => off(n));
        return { texts, max: Math.max(0, ...all) };
      }, h.scene);
      for (const x of r.texts) assert.ok(x.size >= 80 || x.off <= 0.05 * x.size + 0.01, `${h.scene}: "${x.text}" at ${x.size}px has a plate offset of ${x.off.toFixed(2)} px`);
      full = Math.max(full, r.max);
    }
    assert.ok(full > 0.004 * 1920 * 0.7 * 0.95, `display type and shapes keep the full offset: ${full}`);
  } finally { await o.close(); }
});

test('under print-plates the plate steps on its frameHold 3 grid: it changes only on frames n mod 3 = 0', async () => {
  const o = await open('print-plates');
  try {
    const { schedule } = await o.mm.meta();
    const e = schedule.items.find((x) => x.scene === 'marker' && x.emphasis).emphasis;
    let prev = null, changes = 0;
    for (let n = Math.floor(e.start * 30) - 3; n <= Math.ceil((e.start + e.d) * 30) + 3; n++) {
      const f = JSON.stringify(offset(await plate(o, n / 30, 'marker')));
      if (prev != null && f !== prev) { changes++; assert.equal(n % 3, 0, `the plate changed on frame ${n}`); }
      prev = f;
    }
    assert.ok(changes >= 3, `the kick shows as a swing of several steps: ${changes} changes`);
  } finally { await o.close(); }
});

test('the finish layers that lie over text add up to no more than 0.08 of ink', async () => {
  const o = await open('print-plates');
  try {
    const r = await o.page.evaluate(() => [...document.querySelectorAll('.mm-scene .mm-finish')][0] && [...document.querySelector('.mm-scene .mm-finish').children]
      .filter((l) => /grain|halftone|fibre/.test(l.className)).map((l) => Number(getComputedStyle(l).opacity)));
    assert.ok(r.length >= 2, JSON.stringify(r));
    const sum = 1 - r.reduce((a, x) => a * (1 - x), 1);
    assert.ok(sum <= 0.08 + 1e-6, `combined coverage ${sum.toFixed(4)} from ${r}`);
  } finally { await o.close(); }
});

test('without misregister the camera has no plate', async () => {
  const o = await open('editorial');
  try { assert.equal(await plate(o, 3.5, 'masked'), 'none'); } finally { await o.close(); }
});

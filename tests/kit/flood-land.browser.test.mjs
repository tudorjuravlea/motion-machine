// transitions/flood landing on a round mark of the incoming scene, in a real page. With land: dot the
// disc shrinks onto the tittle of the first "i" of the incoming headline: its centre and radius match
// the dot as the picture shows it (measured here from the screenshot's own pixels, not from the
// pattern's measure) within a pixel; it stays in the flood's accent, covering the dot exactly, then
// fades off it over the hand-over; the frame before the hand-over ends and the frame after it are the
// same pixels around the dot.
// With land: circle it lands on a round element the same way. With no round mark it lands on a
// point and says so in mm.warnings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'flood-land-test');
const scenes = (headline, cutParams) => [
  { id: 'a', layout: 'layouts/statement', duration: 2, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.1, slot: 'headline', fx: 'entrances/fade', text: 'One colour takes the frame' }] },
  { id: 'b', layout: 'layouts/statement', duration: 2.5, cut: 'transitions/flood', move: null, say: 'A test scene.', cutParams,
    beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: headline, params: { dur: 'quick' } }, { at: 0, slot: 'sub', fx: 'entrances/fade', text: '', params: { dur: 'quick' } }] },
];
const story = (s) => ({
  id: 'flood-land-test', kind: 'film', formats: ['16x9', '9x16'], title: 'flood land test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes: s, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
function piece(name, brand, s, css = '') {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  const style = join(OUT, `${brand}.style.json`);
  composeToFile({ brand, motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  // the sub slot is left empty in the dot pieces: drop its beat so only the headline arrives
  const sc = s.map((x) => ({ ...x, beats: x.beats.filter((b) => b.text !== '') }));
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(sc), null, 2));
  if (css) appendFileSync(join(dir, 'piece.css'), css);
  return dir;
}

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const brand of ['paper', 'nocturne']) dirs[`dot-${brand}`] = piece(`dot-${brand}`, brand, scenes('Ideas in motion', { from: 'headline', to: 'headline', land: 'dot' }));
  dirs.none = piece('none', 'paper', scenes('No round mark', { from: 'headline', to: 'headline', land: 'dot' }));
  // a round accent element as the incoming sub slot (the piece's own CSS shapes it; a no-break space fills it)
  const round = scenes('A round mark', { from: 'headline', to: 'sub', land: 'circle' });
  round[1].beats[1] = { ...round[1].beats[1], text: '\u00a0' };
  dirs.circle = piece('circle', 'paper', round,
    '\n[data-scene="b"] [data-slot="sub"] { width: 180px; height: 180px; border-radius: 50%; background: var(--mm-color-accent); align-self: center; }\n');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const cutOf = async (o) => (await o.mm.meta()).schedule.scenes[1];
// the disc as drawn on the incoming section, in page px (the stage is drawn 1:1)
const discOf = (o) => o.page.evaluate(() => {
  const s = document.querySelector('[data-scene="b"]'), r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  const g = (n) => parseFloat(s.style.getPropertyValue(`--mm-tx-flood-${n}`));
  if (!Number.isFinite(g('r'))) return null;
  const ry = g('ry');
  return { x: r.left + g('x') * k, y: r.top + g('y') * k, r: g('r') * k, ry: (Number.isFinite(ry) ? ry : g('r')) * k, color: s.style.getPropertyValue('--mm-tx-flood-color') };
});

// The tittle of the first "i" of the headline, read from a screenshot: the ink's coverage in each
// pixel of the letter's box (0 on the canvas colour, 1 on the text colour), its blobs, the one above
// the stem; centre and upright semi-axes from the coverage's moments (an oval dot has two).
async function tittleFromPixels(o) {
  const g = await o.page.evaluate(() => {
    const el = document.querySelector('[data-scene="b"] [data-slot="headline"]');
    const n = [...el.childNodes].find((x) => x.nodeType === 3);
    const i = n.textContent.indexOf('i');
    const range = document.createRange(); range.setStart(n, i); range.setEnd(n, i + 1);
    const r = range.getBoundingClientRect();
    const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c.match(/\d+/g).slice(0, 3).map(Number); };
    return { box: { x: r.left, y: r.top, w: r.width, h: r.height }, ink: rgb(getComputedStyle(el).color), canvas: rgb(getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim()) };
  });
  const png = decodePng(await o.page.screenshot({ type: 'png', animations: 'disabled' }));
  const x0 = Math.floor(g.box.x) - 4, y0 = Math.floor(g.box.y), w = Math.ceil(g.box.w) + 8, h = Math.ceil(g.box.h);
  const span = g.ink.map((v, k) => v - g.canvas[k]), len2 = span.reduce((s, v) => s + v * v, 0);
  const cov = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * png.width + x0 + x) * 4;
    const t = [0, 1, 2].reduce((s, k) => s + (png.data[i + k] - g.canvas[k]) * span[k], 0) / len2;
    cov[y * w + x] = Math.min(1, Math.max(0, t));
  }
  // blobs of coverage at half or more, 8-connected
  const lab = new Int32Array(w * h).fill(-1), blobs = [];
  for (let s = 0; s < w * h; s++) {
    if (cov[s] < 0.5 || lab[s] >= 0) continue;
    const b = { px: [], y0: Infinity, y1: -Infinity }, st = [s]; lab[s] = blobs.length;
    while (st.length) {
      const p = st.pop(), x = p % w, y = (p - x) / w; b.px.push(p); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, q = Y * w + X; if (X >= 0 && Y >= 0 && X < w && Y < h && cov[q] >= 0.5 && lab[q] < 0) { lab[q] = blobs.length; st.push(q); } }
    }
    blobs.push(b);
  }
  const main = blobs.reduce((a, b) => (b.px.length > a.px.length ? b : a));
  const dot = blobs.filter((b) => b !== main && b.y1 <= main.y0 + 1).reduce((a, b) => (!a || b.px.length > a.px.length ? b : a), null);
  assert.ok(dot, 'the screenshot shows a tittle');
  const id = lab[dot.px[0]], seen = new Set(dot.px);
  let A = 0, sx = 0, sy = 0;
  const add = (p) => { const x = p % w, y = (p - x) / w; A += cov[p]; sx += cov[p] * (x + 0.5); sy += cov[p] * (y + 0.5); };
  for (const p of dot.px) {
    add(p);
    const x = p % w, y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (y + dy) * w + x + dx; if (!seen.has(q) && cov[q] < 0.5 && (lab[q] < 0 || lab[q] === id)) { seen.add(q); add(q); } }
  }
  const cx = sx / A, cy = sy / A;
  let xx = 0, yy = 0;
  for (const p of seen) { const x = p % w + 0.5 - cx, y = (p - (p % w)) / w + 0.5 - cy; xx += cov[p] * x * x; yy += cov[p] * y * y; }
  return { x: x0 + cx, y: y0 + cy, rx: 2 * Math.sqrt(xx / A - 1 / 12), ry: 2 * Math.sqrt(yy / A - 1 / 12) };
}

for (const brand of ['paper', 'nocturne']) {
  test(`land: dot · ${brand}: the disc lands on the tittle of the "i", in centre, radius and colour, and hands over with no jump`, async () => {
    for (const format of ['16x9', '9x16']) {
      const o = await openPiece(dirs[`dot-${brand}`], { server, browser, format });
      try {
        const sc = await cutOf(o), end = sc.start + sc.cut.d;
        // the hand-over: the disc sits still on the dot, in the accent, then fading off it
        const ph = await o.page.evaluate(async (d) => { const m = await import('/patterns/transitions/flood/pattern.js'); return m.phasesOf(d, m.default.params.hold.default, true); }, sc.cut.d);
        const on = ph.a + ph.h + ph.s;
        const shots = [];
        for (const f of [on + 0.02 * ph.b, on + 0.4 * ph.b, on + 0.9 * ph.b]) {
          await framePng(o.page, sc.start + f * sc.cut.d);
          shots.push(await discOf(o));
        }
        for (const d of shots) assert.deepEqual([d.x, d.y, d.r, d.ry], [shots[0].x, shots[0].y, shots[0].r, shots[0].ry], `${format}: the disc holds still on the dot`);
        const disc = shots[0];
        const pct = (c) => (c === 'var(--mm-color-accent)' ? 100 : Number((/^color-mix\(in srgb, var\(--mm-color-accent\) ([\d.]+)%, transparent\)$/.exec(c) ?? [])[1]));
        assert.ok(pct(disc.color) > 99, `${format}: still the accent as it lands: ${disc.color}`);
        assert.ok(pct(shots[2].color) < 20, `${format}: fading off the dot at the end: ${shots[2].color}`);
        const whole = decodePng(await framePng(o.page, sc.start + (on + 0.02 * ph.b) * sc.cut.d));
        const last = decodePng(await framePng(o.page, sc.start + 0.995 * sc.cut.d));
        const afterPng = decodePng(await framePng(o.page, end + 0.05));
        const real = await tittleFromPixels(o);
        assert.ok(Math.abs(disc.x - real.x) <= 1 && Math.abs(disc.y - real.y) <= 1, `${format}: centre ${disc.x.toFixed(2)}, ${disc.y.toFixed(2)} vs the dot ${real.x.toFixed(2)}, ${real.y.toFixed(2)}`);
        assert.ok(Math.abs(disc.r - real.rx) <= 1 && Math.abs(disc.ry - real.ry) <= 1, `${format}: semi-axes ${disc.r.toFixed(2)}, ${disc.ry.toFixed(2)} vs the dot's ${real.rx.toFixed(2)}, ${real.ry.toFixed(2)}`);
        const R = Math.ceil(disc.r * 2.5);
        const diff = (A, B, fn) => {
          for (let y = Math.round(disc.y) - R; y <= Math.round(disc.y) + R; y++) for (let x = Math.round(disc.x) - R; x <= Math.round(disc.x) + R; x++) {
            const i = (y * A.width + x) * 4;
            fn(x, y, Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]));
          }
        };
        // the accent disc covers exactly the dot: inside its edge (less a pixel and a half) every pixel
        // shows the disc, not the dot; outside it (plus a pixel and a half) the frame is the dot's own
        diff(whole, afterPng, (x, y, dv) => {
          const e = (Math.hypot((x + 0.5 - disc.x) / disc.r, (y + 0.5 - disc.y) / disc.ry) - 1) * Math.min(disc.r, disc.ry);
          if (e < -1.5) assert.ok(dv > 96, `${format}: the dot shows through the disc at (${x}, ${y})`);
          if (e > 1.5) assert.ok(dv <= 96, `${format}: the disc reaches past the dot at (${x}, ${y})`);
        });
        // no jump: the last frame of the cut and the first after it are the same picture around the dot
        let worst = 0;
        diff(last, afterPng, (x, y, dv) => { worst = Math.max(worst, dv); });
        assert.ok(worst <= 12, `${format}: the hand-over changes a pixel by ${worst}`);
        const w = (await o.mm.meta()).warnings.filter((x) => /flood/.test(x));
        assert.deepEqual(w, [], 'no warning');
      } finally { await o.close(); }
    }
  });
}

test('land: circle: the disc lands on a round element, in its centre, radius and fill role', async () => {
  const o = await openPiece(dirs.circle, { server, browser, format: '16x9' });
  try {
    const sc = await cutOf(o);
    const ph = await o.page.evaluate(async (d) => { const m = await import('/patterns/transitions/flood/pattern.js'); return m.phasesOf(d, m.default.params.hold.default, true); }, sc.cut.d);
    await framePng(o.page, sc.start + (1 - ph.b) * sc.cut.d);
    const disc = await discOf(o);
    const el = await o.page.evaluate(() => { const r = document.querySelector('[data-scene="b"] [data-slot="sub"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 }; });
    assert.ok(Math.abs(disc.x - el.x) <= 1 && Math.abs(disc.y - el.y) <= 1 && Math.abs(disc.r - el.r) <= 1, `${JSON.stringify(disc)} vs ${JSON.stringify(el)}`);
    assert.equal(disc.color, 'var(--mm-color-accent)');
    // the collapse onto it takes about 0.55 s and the hand-over 0.1 s
    assert.ok(Math.abs(ph.s * sc.cut.d - 0.55) < 0.03 && Math.abs(ph.b * sc.cut.d - 0.1) < 0.01, JSON.stringify(ph));
  } finally { await o.close(); }
});

test('land: dot with no round mark in the text lands on a point and says so in mm.warnings', async () => {
  const o = await openPiece(dirs.none, { server, browser, format: '16x9' });
  try {
    const sc = await cutOf(o);
    await framePng(o.page, sc.start + 0.995 * sc.cut.d);
    const disc = await discOf(o);
    assert.ok(disc && disc.r < 20, `a point at the end: ${JSON.stringify(disc)}`);
    const w = (await o.mm.meta()).warnings.filter((x) => /transitions\/flood: land "dot"/.test(x));
    assert.equal(w.length, 1, JSON.stringify(w));
  } finally { await o.close(); }
});

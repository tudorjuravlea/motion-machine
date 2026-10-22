// The covering cuts on the scenes that are hardest for them, in a real page:
// - flood and brush-wipe out of a pile-up (cards stacked with their own z-index) cover every pixel
//   at the middle of the cut: no layout can draw above a transition's overlay;
// - re-ink into a 3D scene (a canvas) never shows a blank frame: it degrades to a plate wipe in a
//   palette role, so every pixel is the plate or the incoming scene as it is drawn without the cut;
// - cover's scrim sinks the outgoing scene on every shipped brand: no pixel of it gets brighter and
//   the visible part of it gets darker on average;
// - a misspelled slot named by flood or iris is a kit warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, readdirSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'cuts-hard-scenes-test');
const BRANDS = readdirSync(join(ROOT, 'styles/brands')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const base = (scenes, formats = ['16x9']) => ({
  kind: 'film', formats, title: 'hard scenes', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
const statement = (id, text, cut = 'transitions/hard-cut', cutParams) => ({ id, layout: 'layouts/statement', duration: 2.5, cut, ...(cutParams ? { cutParams } : {}), move: null, say: 'A test scene.',
  beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text, params: { instant: true } }] });

let server, browser;
const styles = {};
function piece(name, brand, story, assets) {
  const dir = join(OUT, name);
  styles[brand] ??= (() => { const s = join(OUT, `${brand}.style.json`); composeToFile({ brand, motion: 'calm', out: s }); return s; })();
  newPiece({ kind: 'film', style: styles[brand], dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify({ id: name, ...story }, null, 2));
  if (assets) cpSync(assets, join(dir, 'assets'), { recursive: true });
  return dir;
}
before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const rgbOf = (page, exprs) => page.evaluate((list) => list.map((e) => {
  const d = document.createElement('div');
  d.style.background = e; document.querySelector('.mm-stage').append(d);
  const c = getComputedStyle(d).backgroundColor; d.remove();
  let m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map(Number);
  m = /color\(srgb ([^)]+)\)/.exec(c);
  return m[1].trim().split(/\s+/).slice(0, 3).map((v) => Math.round(Number(v) * 255));
}), exprs);
const pixel = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function toSegment(p, a, b) {
  const ab = a.map((v, i) => b[i] - v), ap = p.map((v, i) => v - a[i]);
  const L = ab.reduce((s, v) => s + v * v, 0);
  const k = L ? Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ap[i], 0) / L)) : 0;
  return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * k)));
}
function toTriangle(p, a, b, c) {
  const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]), w = p.map((x, i) => x - a[i]);
  const dot = (x, y) => x.reduce((s, e, i) => s + e * y[i], 0);
  const uu = dot(u, u), uv = dot(u, v), vv = dot(v, v), wu = dot(w, u), wv = dot(w, v), D = uu * vv - uv * uv;
  if (D > 1e-9) {
    const s = (vv * wu - uv * wv) / D, t = (uu * wv - uv * wu) / D;
    if (s >= 0 && t >= 0 && s + t <= 1) return Math.hypot(...w.map((x, i) => x - s * u[i] - t * v[i]));
  }
  return Math.min(toSegment(p, a, b), toSegment(p, a, c), toSegment(p, b, c));
}

const pileScene = () => ({ ...JSON.parse(readFileSync(join(ROOT, 'patterns/layouts/pile-up/demo/story.json'), 'utf8')).scenes[0], id: 'pile', duration: 7.3 });

for (const brand of ['paper', 'nocturne']) {
  test(`flood out of a pile-up · ${brand}: at the middle of the cut every pixel is the flood`, async () => {
    const dir = piece(`pile-flood-${brand}`, brand, base([pileScene(), statement('after', 'After the pile', 'transitions/flood')]));
    const o = await openPiece(dir, { server, browser, format: '16x9' });
    try {
      const sc = (await o.mm.meta()).schedule.scenes[1];
      const [accent] = await rgbOf(o.page, ['var(--mm-color-accent)']);
      for (const k of [0.45, 0.499]) {   // before the middle the outgoing pile is the scene drawn under the flood
        const img = decodePng(await framePng(o.page, sc.start + sc.cut.d * k));
        let off = 0, first = null;
        for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) {
          const p = pixel(img, x, y);
          if (Math.hypot(...p.map((v, i) => v - accent[i])) > 4) { off++; first ??= `${x},${y}: ${p}`; }
        }
        assert.equal(off, 0, `l ${k}: ${off} sampled pixels are not the flood (first ${first})`);
      }
    } finally { await o.close(); }
  });

  test(`brush-wipe out of a pile-up · ${brand}: just before the middle of the cut every pixel is a band colour`, async () => {
    const dir = piece(`pile-brush-${brand}`, brand, base([pileScene(), statement('after', 'After the pile', 'transitions/brush-wipe')]));
    const o = await openPiece(dir, { server, browser, format: '16x9' });
    try {
      const sc = (await o.mm.meta()).schedule.scenes[1];
      const cols = await rgbOf(o.page, ['var(--mm-color-accent)', 'color-mix(in srgb, var(--mm-color-accent) 62%, var(--mm-color-ink))', 'color-mix(in srgb, var(--mm-color-accent) 70%, var(--mm-color-canvas))']);
      const img = decodePng(await framePng(o.page, sc.start + sc.cut.d * 0.499));   // the outgoing pile is still the scene drawn
      let off = 0, first = null;
      for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) {
        const p = pixel(img, x, y);
        if (toTriangle(p, cols[0], cols[1], cols[2]) > 3) { off++; first ??= `${x},${y}: ${p}`; }
      }
      assert.equal(off, 0, `${off} sampled pixels outside the bands (first ${first})`);
    } finally { await o.close(); }
  });
}

test('re-ink into a 3D scene never shows a blank frame: it wipes with a plate in a palette role', async () => {
  const laptop = JSON.parse(readFileSync(join(ROOT, 'patterns/3d/laptop/demo/story.json'), 'utf8')).scenes[0];
  const three = (cut) => ({ ...laptop, id: 'three', duration: 4, cut, beats: laptop.beats.map((b) => ({ ...b, at: 0 })) });
  const assets = join(ROOT, 'patterns/3d/laptop/demo/assets');
  const dir = piece('reink-3d-paper', 'paper', base([statement('before', 'Before the device'), three('transitions/re-ink')]), assets);
  // the same scenes with a hard cut: what the incoming scene looks like as itself at each instant
  const twin = piece('reink-3d-twin', 'paper', base([statement('before', 'Before the device'), three('transitions/hard-cut')]), assets);
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  const p = await openPiece(twin, { server, browser, format: '16x9' });
  try {
    const sc = (await o.mm.meta()).schedule.scenes[1];
    assert.equal((await p.mm.meta()).schedule.scenes[1].start, sc.start);
    const [ink] = await rgbOf(o.page, ['var(--mm-color-ink)']);
    // Once the outgoing scene is gone (the second half), every pixel is the plate or the incoming
    // scene exactly as it is drawn without the cut: never its ground without its device.
    const bad = [];
    let plate = 0, shown = 0;
    for (let k = 0.5; k < 1; k += 0.05) {
      const t = sc.start + sc.cut.d * k;
      const img = decodePng(await framePng(o.page, t)), ref = decodePng(await framePng(p.page, t));
      let off = 0, inked = 0, all = 0;
      for (let y = 0; y < img.height; y += 4) for (let x = 0; x < img.width; x += 4) {
        const a = pixel(img, x, y), r = pixel(ref, x, y); all++;
        const isPlate = Math.hypot(...a.map((v, i) => v - ink[i])) <= 6;
        if (isPlate) inked++;
        else if (Math.hypot(...a.map((v, i) => v - r[i])) > 12) off++;
      }
      if (off / all > 0.01) bad.push(`l ${k.toFixed(2)}: ${(100 * off / all).toFixed(1)} % of the frame is neither the plate nor the scene as itself`);
      if (inked / all > 0.97) plate++;
      if (k > 0.85 && inked / all < 0.5) shown++;
    }
    assert.deepEqual(bad, [], 'the incoming scene is drawn without its device');
    assert.ok(plate >= 1, 'the plate (ink, under the default inks) covers the frame at the middle');
    assert.ok(shown >= 1, 'the device scene is uncovered by the end of the cut');
    const copies = await o.page.evaluate((x) => { window.mm.seek(x); return document.querySelectorAll('.mm-stage > .mm-scene[data-mm-overlay]').length; }, sc.start + sc.cut.d * 0.7);
    assert.equal(copies, 0, 'no copy of a scene holding a canvas is ever drawn');
  } finally { await o.close(); await p.close(); }
});

test('cover sinks the outgoing scene on every shipped brand: nothing in it brightens, and it darkens on average', async () => {
  for (const brand of BRANDS) {
    const dir = piece(`cover-${brand}`, brand, base([statement('before', 'The scene that leaves'), statement('after', 'The scene that arrives', 'transitions/cover', { dim: 0.6 })]));
    const o = await openPiece(dir, { server, browser, format: '16x9' });
    try {
      const sc = (await o.mm.meta()).schedule.scenes[1];
      const k = 0.4;   // the incoming scene covers the bottom 40 %; compare the top half of the frame
      const a = decodePng(await framePng(o.page, sc.start - 0.05)), b = decodePng(await framePng(o.page, sc.start + sc.cut.d * k));
      const edge = await o.page.evaluate(() => { const r = document.querySelector('[data-scene="after"]').getBoundingClientRect(); return r.top; });
      const rows = Math.floor(Math.min(edge, b.height) - 4);
      let up = 0, sa = 0, sb = 0, n = 0, worst = null;
      for (let y = 0; y < rows; y += 2) for (let x = 0; x < b.width; x += 2) {
        const la = lum(pixel(a, x, y)), lb = lum(pixel(b, x, y));
        sa += la; sb += lb; n++;
        if (lb > la + 2) { up++; worst ??= `${x},${y}: ${la.toFixed(0)} -> ${lb.toFixed(0)}`; }
      }
      assert.ok(rows > 100, `${brand}: the outgoing scene shows (${rows} rows)`);
      assert.equal(up, 0, `${brand}: ${up} pixels brighten under the scrim (first ${worst})`);
      assert.ok(sb / n < sa / n - 0.5, `${brand}: the outgoing scene darkens on average (${(sa / n).toFixed(1)} -> ${(sb / n).toFixed(1)})`);
    } finally { await o.close(); }
  }
});

test('a misspelled slot in a flood or iris cutParams is named in mm.warnings', async () => {
  const dir = piece('typo-paper', 'paper', base([statement('a', 'First'), statement('b', 'Second', 'transitions/flood', { from: 'nope', to: 'nada' }), statement('c', 'Third', 'transitions/iris', { target: 'hedline' })]));
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    const sc = (await o.mm.meta()).schedule.scenes;
    const w = await o.page.evaluate(async (ts) => { for (const t of ts) { window.mm.seek(t); await window.mm.settle?.(); } return window.mm.warnings; }, [sc[1].start + sc[1].cut.d * 0.3, sc[1].start + sc[1].cut.d * 0.7, sc[2].start + sc[2].cut.d * 0.5]);
    for (const [cut, name, scene] of [['flood', 'nope', 'a'], ['flood', 'nada', 'b'], ['iris', 'hedline', 'c']]) {
      assert.ok(w.some((x) => x.startsWith(`transitions/${cut}:`) && x.includes(`"${name}"`) && x.includes(`scene ${scene}`)), `${cut} ${name}: ${JSON.stringify(w)}`);
    }
  } finally { await o.close(); }
});

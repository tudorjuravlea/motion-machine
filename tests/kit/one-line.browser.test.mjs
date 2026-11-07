// entrances/one-line in the page: a mark from its SVG drawn as one continuous line. The finished
// line matches the mark the browser itself draws from the same SVG (IoU >= 0.9 at final scale, on
// three invented marks); the drawn share grows through the entrance; a follow camera is back on the
// whole mark at the end; a boiling line holds still in a deck; G-DETERMINISM and G-BRAND pass on
// paper and nocturne.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'one-line-test');
const FIX = join(ROOT, 'fixtures', 'one-line');
const MARKS = ['wave', 'frame', 'orbit'];
const scene = (id, mark, params = {}) => ({
  id, layout: 'layouts/caption-bar', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.2, slot: 'stage', fx: 'entrances/one-line', asset: `assets/${mark}.svg`, params: { dur: 2.4, ...params } },
    { at: 2.8, slot: 'caption', fx: 'entrances/fade', text: 'Drawn in a single stroke.' },
  ],
});
const SCENES = [...MARKS.map((m) => scene(m, m)), scene('follow', 'orbit', { follow: 0.8 }), scene('boil', 'frame', { boil: true })];
const story = (kind, scenes) => ({
  id: 'one-line-test', kind, formats: ['16x9', '9x16'], title: 'one line test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
function piece(name, brand, kind = 'film') {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  const style = join(OUT, `${brand}.style.json`);
  composeToFile({ brand, motion: 'calm', out: style });
  newPiece({ kind, style, dir });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  for (const m of MARKS) cpSync(join(FIX, `${m}.svg`), join(dir, 'assets', `${m}.svg`));
  const scenes = kind === 'deck' ? SCENES.filter((s) => s.id === 'boil').map(({ duration, ...s }) => ({ ...s, presses: 3, beats: s.beats.map((b, i) => ({ ...b, at: 0, step: i + 1 })) })) : SCENES;
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(kind, scenes), null, 2));
  return dir;
}

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dirs.paper = piece('paper', 'paper');
  dirs.nocturne = piece('nocturne', 'nocturne');
  dirs.deck = piece('deck', 'paper', 'deck');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const stageOf = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'stage');
const sel = (id) => `[data-scene="${id}"] [data-slot="stage"]`;
const LOOK = (s) => {
  const el = document.querySelector(s), g = el.querySelector(':scope > svg.mm-one-line > g');
  const paths = g ? [...g.querySelectorAll('path')] : [];
  return { runs: paths.length, d: paths.map((p) => p.getAttribute('d')).join('|'), widths: paths.map((p) => parseFloat(p.dataset.width)), lengths: paths.map((p) => parseFloat(p.dataset.length)), transform: g?.getAttribute('transform') ?? null };
};
async function look(o, t, id) { await o.mm.seek(t); return o.page.evaluate(([s, src]) => (0, eval)(`(${src})`)(s), [sel(id), LOOK.toString()]); }

// the slot's pixels as a mask of ink (nearer the ink role than the canvas)
async function inkMask(o, id) {
  const { box, ink, canvas } = await o.page.evaluate((s) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect();
    const rgb = (v) => { const c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    return { box: { x: r.left, y: r.top, width: r.width, height: r.height }, ink: rgb('--mm-color-ink'), canvas: rgb('--mm-color-canvas') };
  }, sel(id));
  const img = decodePng(await o.page.screenshot({ type: 'png', clip: box, animations: 'disabled' }));
  const m = new Uint8Array(img.width * img.height);
  const d2 = (k, c) => (img.data[k] - c[0]) ** 2 + (img.data[k + 1] - c[1]) ** 2 + (img.data[k + 2] - c[2]) ** 2;
  for (let i = 0; i < m.length; i++) m[i] = d2(i * 4, ink) < d2(i * 4, canvas) ? 1 : 0;
  return m;
}
// the browser's own drawing of the same SVG, stroked in ink at the line's mean width, fitted the same way
async function drawReference(o, id, mark, meanWidth) {
  const text = readFileSync(join(FIX, `${mark}.svg`), 'utf8');
  await o.page.evaluate(([s, svgText, w]) => {
    const el = document.querySelector(s);
    el.querySelector(':scope > svg.mm-one-line').style.visibility = 'hidden';
    const src = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    const [bx, by, bw, bh] = src.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const W = el.clientWidth, H = el.clientHeight, k = Math.min(W / bw, H / bh) * 0.86;
    const NS = 'http://www.w3.org/2000/svg';
    const ref = document.createElementNS(NS, 'svg');
    ref.setAttribute('class', 'mm-one-line-ref');
    ref.setAttribute('width', String(W)); ref.setAttribute('height', String(H));
    ref.setAttribute('style', 'position:absolute;left:0;top:0;overflow:visible');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${(W - bw * k) / 2 - bx * k} ${(H - bh * k) / 2 - by * k}) scale(${k})`);
    for (const n of [...src.children]) g.append(document.importNode(n, true));
    for (const n of g.querySelectorAll('*')) n.setAttribute('style', `fill:none;stroke:var(--mm-color-ink);stroke-width:${w}px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round`);
    ref.append(g);
    el.append(ref);
  }, [sel(id), text, meanWidth]);
}

test('the finished line matches the mark the browser draws from the same SVG: IoU >= 0.9, on three marks, two formats', async () => {
  const scores = [];
  for (const format of ['16x9', '9x16']) {
    const o = await openPiece(dirs.paper, { server, browser, format });
    try {
      for (const mark of MARKS) {
        const it = await stageOf(o, mark);
        const rest = it.start + it.d + 0.2;
        const l = await look(o, rest, mark);
        assert.ok(l.runs >= 1 && l.lengths.reduce((a, b) => a + b, 0) > 500, `${format} ${mark}: drawn (${l.runs} runs)`);
        // the reference is stroked at the line's mean width, each run weighted by its length
        const mean = l.widths.reduce((a, w, i) => a + w * l.lengths[i], 0) / l.lengths.reduce((a, b) => a + b, 0);
        const a = await inkMask(o, mark);
        await drawReference(o, mark, mark, mean);
        const b = await inkMask(o, mark);
        let and = 0, or = 0;
        for (let i = 0; i < a.length; i++) { and += a[i] & b[i]; or += a[i] | b[i]; }
        const iou = and / or;
        scores.push(`${format} ${mark} ${iou.toFixed(3)}`);
        assert.ok(or > 500, `${format} ${mark}: the masks are not empty`);
        assert.ok(iou >= 0.9, `${format} ${mark}: IoU ${iou.toFixed(3)}`);
      }
    } finally { await o.close(); }
  }
  console.log(`one-line IoU: ${scores.join(', ')}`);
});

// pale pixels inside the line: a pixel whose 5 x 5 neighbourhood is all ink yet that itself is
// lighter than the ink by more than 12 % of the way to the canvas (a seam across the stroke)
async function seams(o, id) {
  const { box, ink, canvas } = await o.page.evaluate((s) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect();
    const rgb = (v) => { const c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    return { box: { x: r.left, y: r.top, width: r.width, height: r.height }, ink: rgb('--mm-color-ink'), canvas: rgb('--mm-color-canvas') };
  }, sel(id));
  const img = decodePng(await o.page.screenshot({ type: 'png', clip: box, animations: 'disabled' }));
  const W = img.width, H = img.height, span = Math.hypot(ink[0] - canvas[0], ink[1] - canvas[1], ink[2] - canvas[2]);
  const off = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) off[i] = Math.hypot(img.data[i * 4] - ink[0], img.data[i * 4 + 1] - ink[1], img.data[i * 4 + 2] - ink[2]) / span;
  let n = 0, inside = 0;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    let all = true;
    for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) > 1 && off[(y + dy) * W + x + dx] > 0.5) { all = false; break; }
    if (!all) continue;
    inside++;
    if (off[y * W + x] > 0.12) n++;
  }
  return { n, inside };
}

test('the line has no seams: inside the stroke every pixel is ink, at rest and mid-draw, on three marks', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '16x9' });
  try {
    for (const mark of MARKS) {
      const it = await stageOf(o, mark);
      for (const t of [it.start + 0.6 * it.d, it.start + it.d + 0.2]) {
        await o.mm.seek(t);
        const r = await seams(o, mark);
        assert.ok(r.inside > 300, `${mark}: the line has an inside (${r.inside} px)`);
        assert.equal(r.n, 0, `${mark} at ${t.toFixed(2)}: ${r.n} pale pixels inside the line (of ${r.inside})`);
      }
    }
  } finally { await o.close(); }
});

test('the line grows through the entrance and is whole at rest; the same instant draws the same line', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '16x9' });
  try {
    const it = await stageOf(o, 'orbit');
    const drawn = (l) => l.lengths.reduce((a, b) => a + b, 0);
    const lens = [];
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) lens.push(drawn(await look(o, it.start + f * it.d, 'orbit')));
    for (let i = 1; i < lens.length; i++) assert.ok(lens[i] > lens[i - 1], `growing: ${lens.map(Math.round)}`);
    const rest = await look(o, it.start + it.d + 0.2, 'orbit');
    assert.ok(drawn(rest) > lens.at(-1));
    assert.deepEqual(await look(o, it.start + it.d + 1, 'orbit'), rest, 'still at rest');
    const mid = await look(o, it.start + 0.5 * it.d, 'orbit');
    assert.equal((await look(o, it.start + 0.5 * it.d, 'orbit')).d, mid.d);
    assert.equal((await look(o, it.start - 0.05, 'orbit')).runs, 0, 'nothing before it starts');
  } finally { await o.close(); }
});

test('a follow camera moves with the nib and is back on the whole mark at the end', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '16x9' });
  try {
    const it = await stageOf(o, 'follow');
    const mid = await look(o, it.start + 0.5 * it.d, 'follow');
    assert.match(mid.transform ?? '', /scale\(1\.\d+\)/, `zoomed in mid-draw: ${mid.transform}`);
    assert.equal((await look(o, it.start + it.d + 0.1, 'follow')).transform, null, 'whole at rest');
    const plain = await look(o, (await stageOf(o, 'orbit')).start + 0.5 * it.d, 'orbit');
    assert.equal(plain.transform, null, 'no camera unless asked');
  } finally { await o.close(); }
});

test('a boiling line shivers at rest in a film, and never in a deck', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '16x9' });
  try {
    const it = await stageOf(o, 'boil');
    const t = Math.ceil((it.start + it.d + 0.05) / 0.4) * 0.4 + 0.1;
    const a = await look(o, t, 'boil'), b = await look(o, t + 0.4, 'boil');
    assert.notEqual(a.d, b.d, 'film: the next boil frame is another line');
  } finally { await o.close(); }
  const d = await openPiece(dirs.deck, { server, browser, format: '16x9' });
  try {
    const p1 = await look(d, 1, 'boil'), p2 = await look(d, 2, 'boil'), p3 = await look(d, 3, 'boil');
    assert.ok(p1.runs >= 1, `drawn by its press: ${p1.runs}`);
    assert.equal(p2.d, p1.d);
    assert.equal(p3.d, p1.d, 'a deck never boils');
  } finally { await d.close(); }
});

test('G-DETERMINISM and G-BRAND pass on paper and nocturne (the mark arrives inside the settle, the same in either seek order)', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const r = await runCheck(dirs[brand], { format: '16x9', only: ['G-DETERMINISM', 'G-BRAND'], server, browser });
    for (const id of ['G-DETERMINISM', 'G-BRAND']) {
      const row = r.rules.find((x) => x.id === id);
      assert.equal(row.status, 'PASS', `${brand} ${id}: ${JSON.stringify(row)}`);
    }
    assert.equal(r.rules.find((x) => x.id === 'G-BRAND').evidence.measured, '0 %');
  }
});

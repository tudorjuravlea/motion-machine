// The element-led and print cuts in a real page: transitions/flood, cover, re-ink, brush-wipe, and
// iris with a target. Each demo story is composed with two brands of opposite polarity (paper and
// nocturne) and checked on every frame of its cut at 30 fps:
// - no type is double-exposed: no scene (nor a re-inked copy of one) is ever drawn part-transparent,
//   so wherever two scenes meet one of them hides the other; flood and brush-wipe never draw both
//   scenes on one frame (only the outgoing one before the middle, only the incoming one after);
// - cover's outgoing scene is the same picture on every frame of the cut (transform and every box);
// - flood's disc reaches all four corners at the middle of the cut; brush-wipe's bands cover every
//   pixel there in band colours (or their blends along antialiased edges); the iris opens from the
//   centre of its target slot;
// - the frames are the same pixels whether the instants are drawn forward or in reverse;
// - `mm check` finds no FAIL and G-BRAND passes at both rests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'flood-cuts-test');
const FPS = 30;
const BRANDS = ['paper', 'nocturne'];
const CUTS = [
  { name: 'flood', strict: true },
  { name: 'brush-wipe', strict: true },
  { name: 'cover' },
  { name: 're-ink' },
  { name: 'iris', params: { target: 'headline' } },
];
let server, browser;
const dirs = {};

before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const brand of BRANDS) {
    const style = join(OUT, `${brand}.style.json`);
    composeToFile({ brand, motion: 'calm', out: style });
    for (const c of CUTS) {
      const dir = join(OUT, `${c.name}-${brand}`);
      newPiece({ kind: 'film', style, dir });
      const story = JSON.parse(readFileSync(join(ROOT, `patterns/transitions/${c.name}/demo/story.json`), 'utf8'));
      if (c.params) story.scenes[1].cutParams = { ...(story.scenes[1].cutParams || {}), ...c.params };
      writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
      dirs[`${c.name}-${brand}`] = dir;
    }
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const frames = (a, b) => { const out = []; for (let f = Math.ceil(a * FPS - 1e-9); f / FPS <= b + 1e-9; f++) out.push(Math.round((f / FPS) * 1e6) / 1e6); return out; };
const cutOf = async (o) => (await o.mm.meta()).schedule.scenes[1];

// Every drawn layer that is a scene or a copy of one: its opacity (with its ancestors') and
// whether its background is opaque.
const layers = (page, t) => page.evaluate(async (x) => {
  window.mm.seek(x); await window.mm.settle?.();
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const v = m[1].split(',').map(Number); return v.length > 3 ? v[3] : 1; };
  return [...document.querySelectorAll('.mm-stage > .mm-scene')].map((s) => {
    const cs = getComputedStyle(s);
    let o = Number(cs.opacity);
    for (let n = s.parentElement; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return { id: s.dataset.scene ?? `copy:${s.hasAttribute('data-mm-overlay')}`, drawn: cs.visibility !== 'hidden' && o > 0.002, o, opaque: alpha(cs.backgroundColor) === 1 };
  });
}, t);

for (const c of CUTS) for (const brand of BRANDS) {
  test(`${c.name} · ${brand}: no type is double-exposed on any frame of the cut${c.strict ? ', and the two scenes never share a frame' : ''}`, async () => {
    for (const format of ['16x9', '9x16']) {
      const o = await openPiece(dirs[`${c.name}-${brand}`], { server, browser, format });
      try {
        const sc = await cutOf(o);
        assert.equal(sc.cut.pattern, `transitions/${c.name}`);
        const faint = [], shared = [], clear = [];
        let sawFrom = false, sawTo = false;
        for (const t of frames(sc.start, sc.start + sc.cut.d)) {
          const ls = await layers(o.page, t);
          const drawn = ls.filter((l) => l.drawn);
          for (const l of drawn) if (l.o < 0.998) faint.push(`${t}: ${l.id} at ${l.o.toFixed(3)}`);
          const from = drawn.some((l) => l.id === 'before'), to = drawn.some((l) => l.id === 'after');
          sawFrom ||= from; sawTo ||= to;
          if (from && to && !drawn.find((l) => l.id === 'after').opaque) clear.push(`${t}: the incoming scene has a see-through ground`);
          const l = (t - sc.start) / sc.cut.d;
          if (c.strict && Math.abs(l - 0.5) > 1e-6 && from && to) shared.push(`${t} (l ${l.toFixed(3)})`);
          if (c.strict && l < 0.5 - 1e-6 && to) shared.push(`${t}: the incoming scene before the middle`);
          if (c.strict && l > 0.5 + 1e-6 && t < sc.start + sc.cut.d - 1e-6 && from) shared.push(`${t}: the outgoing scene after the middle`);
        }
        assert.deepEqual(faint, [], `${format}: a scene drawn part-transparent is a double exposure`);
        assert.deepEqual(clear, [], format);
        assert.deepEqual(shared, [], `${format}: both scenes on one frame`);
        assert.ok(sawFrom && sawTo, `${format}: both scenes appear in the cut`);
      } finally { await o.close(); }
    }
  });
}

test('cover: the outgoing scene is the same picture on every frame of the cut (transform and every box)', async () => {
  for (const brand of BRANDS) for (const format of ['16x9', '9x16']) {
    const o = await openPiece(dirs[`cover-${brand}`], { server, browser, format });
    try {
      const sc = await cutOf(o);
      const pose = (t) => o.page.evaluate((x) => {
        window.mm.seek(x);
        const s = document.querySelector('[data-scene="before"]');
        const box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100); };
        return JSON.stringify({ t: getComputedStyle(s).transform, cam: getComputedStyle(s.querySelector('.mm-camera')).transform, boxes: [...s.querySelectorAll('[data-slot]')].map(box), self: box(s) });
      }, t);
      const ref = await pose(sc.start - 1 / FPS);
      const moved = [];
      for (const t of frames(sc.start, sc.start + sc.cut.d - 1e-3)) { const p = await pose(t); if (p !== ref) moved.push(`${t}: ${p}`); }
      assert.deepEqual(moved, [], `${brand} ${format}`);
      const before = await o.page.evaluate((x) => { window.mm.seek(x); return getComputedStyle(document.querySelector('[data-scene="after"]')).transform; }, sc.start + sc.cut.d / 2);
      assert.notEqual(before, 'none', 'the incoming scene is moving half way');
    } finally { await o.close(); }
  }
});

// The page colour of a CSS colour expression, as [r, g, b] in 0..255.
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
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// Distance from p to the segment a-b in RGB (a blend of two colours along an antialiased edge).
function toSegment(p, a, b) {
  const ab = a.map((v, i) => b[i] - v), ap = p.map((v, i) => v - a[i]);
  const L = ab.reduce((s, v) => s + v * v, 0);
  const k = L ? Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ap[i], 0) / L)) : 0;
  return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * k)));
}
// Distance from p to the triangle a-b-c in RGB (where three band colours meet in one pixel).
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

test('flood: at the middle of the cut the disc of the accent reaches all four corners', async () => {
  for (const brand of BRANDS) for (const format of ['16x9', '9x16']) {
    const o = await openPiece(dirs[`flood-${brand}`], { server, browser, format });
    try {
      const sc = await cutOf(o);
      const [accent] = await rgbOf(o.page, ['var(--mm-color-accent)']);
      const img = decodePng(await framePng(o.page, sc.start + sc.cut.d / 2));
      for (const [x, y] of [[1, 1], [img.width - 2, 1], [1, img.height - 2], [img.width - 2, img.height - 2]]) {
        assert.ok(near(pixel(img, x, y), accent), `${brand} ${format} corner ${x},${y}: ${pixel(img, x, y)} vs accent ${accent}`);
      }
    } finally { await o.close(); }
  }
});

test('brush-wipe: at the middle of the cut every pixel of the stage is a band colour or a blend of band colours', async () => {
  for (const brand of BRANDS) for (const format of ['16x9', '9x16']) {
    const o = await openPiece(dirs[`brush-wipe-${brand}`], { server, browser, format });
    try {
      const sc = await cutOf(o);
      const cols = await rgbOf(o.page, ['var(--mm-color-accent)', 'color-mix(in srgb, var(--mm-color-accent) 62%, var(--mm-color-ink))', 'color-mix(in srgb, var(--mm-color-accent) 70%, var(--mm-color-canvas))']);
      const img = decodePng(await framePng(o.page, sc.start + sc.cut.d / 2));
      let off = 0, first = null;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const p = pixel(img, x, y);
        const d = toTriangle(p, cols[0], cols[1], cols[2]);
        if (d > 3) { off++; first ??= `${x},${y}: ${p}`; }
      }
      assert.equal(off, 0, `${brand} ${format}: ${off} pixels outside the bands (first ${first})`);
    } finally { await o.close(); }
  }
});

test('iris with a target: the aperture is centred on the target slot\'s box (within 2 px)', async () => {
  for (const format of ['16x9', '9x16', '1x1']) {
    const o = await openPiece(dirs['iris-paper'], { server, browser, format });
    try {
      const sc = await cutOf(o);
      const r = await o.page.evaluate((x) => {
        window.mm.seek(x);
        const s = document.querySelector('[data-scene="after"]');
        const k = s.offsetWidth / s.getBoundingClientRect().width;
        const a = s.getBoundingClientRect(), b = s.querySelector('[data-slot="headline"]').getBoundingClientRect();
        return { clip: s.style.clipPath, x: (b.left - a.left + b.width / 2) * k, y: (b.top - a.top + b.height / 2) * k };
      }, sc.start + sc.cut.d / 2);
      const m = /circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)/.exec(r.clip);
      assert.ok(m, `${format}: a circle in pixels (${r.clip})`);
      assert.ok(Math.abs(+m[2] - r.x) <= 2 && Math.abs(+m[3] - r.y) <= 2, `${format}: centre ${m[2]},${m[3]} vs slot ${r.x},${r.y}`);
    } finally { await o.close(); }
  }
});

test('every cut draws the same pixels whether its instants are visited forward or in reverse', async () => {
  for (const c of CUTS) {
    const o = await openPiece(dirs[`${c.name}-paper`], { server, browser, format: '16x9' });
    try {
      const { schedule } = await o.mm.meta();
      const sc = schedule.scenes[1];
      const ts = [schedule.rests[0], sc.start + sc.cut.d * 0.2, sc.start + sc.cut.d * 0.5, sc.start + sc.cut.d * 0.8, schedule.rests.at(-1)];
      const fwd = [];
      for (const t of ts) fwd.push(Buffer.from(decodePng(await framePng(o.page, t)).data));
      for (let i = ts.length - 1; i >= 0; i--) {
        const back = Buffer.from(decodePng(await framePng(o.page, ts[i])).data);
        assert.ok(back.equals(fwd[i]), `${c.name}: t = ${ts[i]} differs between forward and reverse seeks`);
      }
    } finally { await o.close(); }
  }
});

test('mm check finds no FAIL, and G-BRAND passes at both rests, for every cut on both brands', () => {
  for (const c of CUTS) for (const brand of BRANDS) {
    let out;
    try {
      out = execFileSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), 'check', dirs[`${c.name}-${brand}`], '--format', '16x9', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { out = e.stdout; }
    const { rules } = JSON.parse(out);
    assert.deepEqual(rules.filter((r) => r.status === 'FAIL').map((r) => r.id), [], `${c.name} ${brand}`);
    const g = rules.find((r) => r.id === 'G-BRAND');
    assert.equal(g.status, 'PASS', `${c.name} ${brand}: G-BRAND`);
    assert.equal(g.evidence.rests, 2);
  }
});

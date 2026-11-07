// transitions/impact, transitions/anticipation, transitions/dissolve-edge, drawn. Each leaves the incoming
// scene as itself at the end of its cut and nothing behind after a seek away; each draws the same pixels
// for the same instant in a fresh page (the lens ramp and the turbulence field are decoded and seeded);
// and what each paints mid-cut is the palette: no pixel off its roles and their blends. The impact
// shows one scene at a time, and the dissolve's edge glows in the role it is told. The pure parts are in
// tests/kit/{impact,anticipation,dissolve-edge}.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng, offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';
import { hexToRgb } from '../../scripts/check/_lib.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const NAMES = ['impact', 'anticipation', 'dissolve-edge'];
const open = (name, { preset = 'kinetic', format = '16x9', cut, brand } = {}) => openPiece(PAGE, { server, browser, format, query: { story: `../../../patterns/transitions/${name}/demo/story`, preset, ...(cut ? { cutParamsJson: JSON.stringify(cut) } : {}), ...(brand ? { patternsJson: JSON.stringify({ [`transitions/${name}`]: brand }) } : {}) } });
const cutOf = async (o) => { const sc = (await o.mm.meta()).schedule.scenes[1]; return { start: sc.start, d: sc.cut.d }; };
const rolesOf = (preset) => Object.values(JSON.parse(readFileSync(join(ROOT, `styles/presets/${preset}.json`), 'utf8')).color).map(hexToRgb);

for (const name of NAMES) {
  test(`${name}: at the end of its cut the incoming scene is bare, and a seek away mid-cut leaves nothing behind`, async () => {
    const o = await open(name);
    try {
      const { start, d } = await cutOf(o);
      await o.mm.seek(start + d * 0.45);
      assert.ok(await o.page.evaluate(() => document.querySelector('[data-scene="after"]').getAttribute('style')), 'it writes something mid-cut');
      await o.mm.seek(start + d + 0.4);
      const r = await o.page.evaluate(() => ({ style: document.querySelector('[data-scene="after"]').getAttribute('style'), overlays: document.querySelectorAll('[data-mm-overlay]').length }));
      assert.ok(!r.style || !/filter|transform|opacity|visibility|background-color/.test(r.style), `the incoming section keeps style: ${r.style}`);
      assert.equal(r.overlays, 0, 'the overlay nodes are gone');
    } finally { await o.close(); }
  });

  test(`${name}: the same instant draws the same pixels in a fresh page`, async () => {
    const shot = async (k) => { const o = await open(name); try { const { start, d } = await cutOf(o); return await framePng(o.page, start + d * k); } finally { await o.close(); } };
    for (const k of [0.2, 0.45, 0.8]) assert.ok((await shot(k)).equals(await shot(k)), `${name} at ${k} of the cut`);
  });

  test(`${name}: mid-cut pixels are the palette's: no colour off its roles and their blends`, async () => {
    for (const preset of ['kinetic', 'editorial']) {
      const o = await open(name, { preset });
      try {
        const { start, d } = await cutOf(o);
        const dist = paletteDistance(rolesOf(preset));
        for (const k of [0.3, 0.38, 0.5, 0.7]) {
          const img = decodePng(await framePng(o.page, start + d * k));
          const r = offPalette(img, dist, 2);
          assert.ok(r.all / r.total < 0.005 && r.largest.size < 256, `${name} ${preset} at ${k}: ${(100 * r.all / r.total).toFixed(2)} % off, region ${r.largest.size}`);
        }
      } finally { await o.close(); }
    }
  });
}

test('impact: only one scene is drawn in any frame, the outgoing one before the hit and the incoming one from it', async () => {
  const o = await open('impact');
  try {
    const { start, d } = await cutOf(o);
    for (const [k, shows] of [[0.1, 'before'], [0.25, 'before'], [0.36, 'after'], [0.6, 'after'], [0.9, 'after']]) {
      await o.mm.seek(start + d * k);
      const vis = await o.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mm-scene')].map((s) => [s.dataset.scene, getComputedStyle(s).visibility !== 'hidden' && Number(getComputedStyle(s).opacity) > 0])));
      assert.deepEqual(vis, { before: shows === 'before', after: shows === 'after' }, `at ${k}`);
    }
  } finally { await o.close(); }
});

test('impact: the incoming scene is punched in at the hit and has settled to its size by the end of the cut', async () => {
  const o = await open('impact', { cut: { strength: 1, shake: 0 } });
  try {
    const { start, d } = await cutOf(o);
    const scale = async (k) => { await o.mm.seek(start + d * k); return o.page.evaluate(() => { const r = document.querySelector('[data-scene="after"]').getBoundingClientRect(); return r.width / document.querySelector('.mm-stage').getBoundingClientRect().width; }); };
    const hit = await scale(0.31), late = await scale(0.95), rest = await scale(1 + 0.3 / d);
    assert.ok(hit > 1.08 && hit <= 1.13, `punched in: ${hit}`);
    assert.ok(late < 1.01, `settled: ${late}`);
    assert.ok(Math.abs(rest - 1) < 1e-6);
  } finally { await o.close(); }
});

test('impact: the fringe is drawn in the roles it is told: another pair, another picture', async () => {
  const shot = async (cut) => { const o = await open('impact', { cut }); try { const { start, d } = await cutOf(o); return await framePng(o.page, start + d * 0.32); } finally { await o.close(); } };
  assert.ok(!(await shot({ outer: 'accent', inner: 'muted' })).equals(await shot({ outer: 'ink', inner: 'line' })));
  assert.ok(!(await shot({ fringe: 1 })).equals(await shot({ fringe: 0 })), 'fringe 0 switches it off');
});

test('a brand sets a transition for every use: style.patterns carries the knobs, a scene\'s cutParams win', async () => {
  const hitScale = async (opts) => {
    const o = await open('impact', opts);
    try {
      const { start, d } = await cutOf(o);
      await o.mm.seek(start + d * 0.31);
      return await o.page.evaluate(() => document.querySelector('[data-scene="after"]').getBoundingClientRect().width / document.querySelector('.mm-stage').getBoundingClientRect().width);
    } finally { await o.close(); }
  };
  const plain = await hitScale({}), heavy = await hitScale({ brand: { strength: 1, shake: 0, fringe: 0 } }), own = await hitScale({ brand: { strength: 1, shake: 0, fringe: 0 }, cut: { strength: 0.2 } });
  assert.ok(heavy > plain + 0.02, `the brand's strength lands harder: ${heavy} against ${plain}`);
  assert.ok(own < heavy - 0.02, `the scene's own cutParams win over the brand: ${own} against ${heavy}`);
});

test('dissolve-edge: the moving edge glows in the role it is told, and the cut reveals about the share of the frame the cut has gone', async () => {
  const o = await open('dissolve-edge', { preset: 'editorial', cut: { glow: 'accent' } });
  try {
    const { start, d } = await cutOf(o);
    const accent = hexToRgb(JSON.parse(readFileSync(join(ROOT, 'styles/presets/editorial.json'), 'utf8')).color.accent);
    const img = decodePng(await framePng(o.page, start + d * 0.5));
    const ch = img.data.length / (img.width * img.height);
    let near = 0;
    for (let i = 0; i < img.data.length; i += ch) if (Math.hypot(img.data[i] - accent[0], img.data[i + 1] - accent[1], img.data[i + 2] - accent[2]) < 30) near++;
    assert.ok(near > 400, `a burning edge in the accent: ${near} px`);
    const other = decodePng(await framePng(o.page, start + d * 0.05));
    let faint = 0;
    for (let i = 0; i < other.data.length; i += ch) if (Math.hypot(other.data[i] - accent[0], other.data[i + 1] - accent[1], other.data[i + 2] - accent[2]) < 30) faint++;
    assert.ok(faint < near, 'the edge kindles with the cut');
  } finally { await o.close(); }
});

test('anticipation: the outgoing scene gives ground before it goes, and a slide keeps the two scenes edge to edge', async () => {
  const o = await open('anticipation', { cut: { mode: 'slide', direction: 'left', pull: 0.1 } });
  try {
    const { start, d } = await cutOf(o);
    const left = async (k) => { await o.mm.seek(start + d * k); return o.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mm-scene')].map((s) => [s.dataset.scene, s.getBoundingClientRect().left]))); };
    const w = await o.page.evaluate(() => document.querySelector('.mm-stage').getBoundingClientRect().width);
    const wind = await left(0.25);
    assert.ok(wind.before > 0.09 * w && wind.before < 0.11 * w, `pulled back against its way: ${wind.before}`);
    for (const k of [0.3, 0.5, 0.8]) { const x = await left(k); assert.ok(Math.abs(x.after - x.before - w) < 1, `edge to edge at ${k}: ${x.after - x.before}`); }
  } finally { await o.close(); }
});

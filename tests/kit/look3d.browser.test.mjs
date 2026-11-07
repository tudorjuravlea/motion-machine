// The look of the 3D stage in a browser: every pass is a pure function of the pose at t (the same
// instants give the same pixels in any seek order), and each param changes pixels where it should and
// nowhere else. tests/kit/media/look3d.json holds a phone and a laptop at rest on a captured page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { PAGE, mediaAssets } from './media-assets.mjs';

let server, browser;
before(async () => {
  mediaAssets('site');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); });

const OFF = { aa: 'off', glow: 0, contact: 0, occlusion: 0, reflection: 0, dof: 0, tilt: 0, brushed: 0, studio: 'light' };
const open = (patterns, preset = 'calm-product') => openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'look3d', preset, patternsJson: JSON.stringify({ '3d/phone': patterns, '3d/laptop': patterns }) } });
const startOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'stage').start;
const shot = async (o, scene, dt = 3) => decodePng(await framePng(o.page, startOf((await o.mm.meta()).schedule, scene) + dt));
// where two same-sized pictures differ: how many pixels, and the box they lie in
function diff(a, b) {
  let n = 0, x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { n, x0, x1, y0, y1 };
}
const withOne = async (change, scene = 'laptop', preset) => {
  const [base, one] = [await open(OFF, preset), await open({ ...OFF, ...change }, preset)];
  try { return { a: await shot(base, scene), b: await shot(one, scene) }; } finally { await base.close(); await one.close(); }
};

const EVERYTHING = { aa: 'ssaa4', glow: 1, contact: 1, occlusion: 1, reflection: 0.5, dof: 0.4, tilt: 0.3, brushed: 0.6, studio: 'brand' };
for (const [name, patterns] of [['every pass on, brand studio', EVERYTHING], ['msaa and the light studio', { aa: 'msaa' }]]) {
  test(`${name}: the same t gives the same pixels in any seek order`, async () => {
    const o = await open(patterns), f = await open(patterns);
    try {
      for (const scene of ['phone', 'laptop']) {
        const t = startOf((await o.mm.meta()).schedule, scene) + 2.4;
        await framePng(o.page, t - 1.1); await framePng(o.page, t + 0.9);   // seek around it first, forward and back
        const a = await framePng(o.page, t), b = await framePng(f.page, t);
        assert.ok(a.equals(b), `${scene}: the frame depends on the seeks before it`);
        assert.ok((await framePng(o.page, t)).equals(a), `${scene}: drawing t twice differs`);
      }
    } finally { await o.close(); await f.close(); }
  });
}

test('aa: ssaa4 moves edge pixels only; the flat middle of the deck stays as it was', async () => {
  const { a, b } = await withOne({ aa: 'ssaa4' });
  const d = diff(a, b);
  assert.ok(d.n > 200, 'edges changed');
  assert.ok(d.n < a.width * a.height * 0.06, `${d.n} pixels differ: more than edges`);
  const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)].join();
  assert.equal(at(a, 900, 790), at(b, 900, 790), 'a deck pixel away from any edge');
});

test('glow: a bright screen lights the air beside it on a dark ground, and not the far corners', async () => {
  const { a, b } = await withOne({ glow: 1 }, 'laptop', 'kinetic');
  const d = diff(a, b);
  assert.ok(d.n > 500, 'the glow drew nothing');
  const corner = (img) => [...img.data.slice(0, 4)].join();
  assert.equal(corner(a), corner(b), 'the top-left corner is far from the screen');
});

test('contact: the shadow lies on the floor (and the key light\'s own eases), the top of the frame stays as it was', async () => {
  const { a, b } = await withOne({ contact: 1 });
  const d = diff(a, b);
  assert.ok(d.n > 500, 'no contact shadow');
  assert.ok(d.y0 > 250, `the shadow reaches up to row ${d.y0}: it should lie on the floor`);
  assert.ok(d.y1 > 800, 'the contact shadow lies under the base');
});

test('occlusion: the creases take shade and the empty corners do not', async () => {
  const { a, b } = await withOne({ occlusion: 1 });
  const d = diff(a, b);
  assert.ok(d.n > 300, 'no occlusion');
  assert.ok(d.x0 > 300 && d.x1 < a.width - 300 && d.y0 > 80, 'occlusion drew outside the device');
});

test('dof: what is nearer or further than the device is blurred; the corners are empty and stay so', async () => {
  const { a, b } = await withOne({ dof: 1 });
  assert.ok(diff(a, b).n > 500, 'no blur');
  assert.equal([...a.data.slice(0, 4)].join(), [...b.data.slice(0, 4)].join());
});

test('tilt: the frame softens toward its edges', async () => {
  const { a, b } = await withOne({ tilt: 1 });
  assert.ok(diff(a, b).n > 500, 'no tilt-shift');
});

test('reflection: the floor in front of the device gains a reflection, the top of the frame is untouched', async () => {
  const { a, b } = await withOne({ reflection: 1 });
  const d = diff(a, b);
  assert.ok(d.n > 200, 'no reflection');
  assert.ok(d.y0 > 500, `the reflection reaches up to row ${d.y0}`);
});

test('studio: the dark room and the light void light the same device differently, inside the device only', async () => {
  const { a, b } = await withOne({ studio: 'dark' });
  const d = diff(a, b);
  assert.ok(d.n > 2000, 'the studios look alike');
  assert.ok(d.x0 > 300 && d.x1 < a.width - 300, 'a studio change reached the empty ground');
});

test('brushed: the grain changes the metal and nothing else', async () => {
  const { a, b } = await withOne({ brushed: 1 });
  const d = diff(a, b);
  assert.ok(d.n > 200, 'no grain');
  assert.ok(d.x0 > 300 && d.x1 < a.width - 300, 'the grain reached the empty ground');
});

test('a brand sets the look once: style.patterns reaches the canvas', async () => {
  const o = await open({ aa: 'off' });
  try {
    await shot(o, 'laptop');
    assert.equal(await o.page.evaluate(() => document.querySelector('canvas[data-3d]').dataset.aa), 'off');
  } finally { await o.close(); }
});

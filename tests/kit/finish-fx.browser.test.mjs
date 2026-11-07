// brand.finish chroma, scanlines, bloom, grainRate and look, drawn. The stage wears one filter, and
// only when chroma, bloom or a look asks; chroma parts the planes at the frame's edge and leaves the
// middle alone; bloom and a look never move a pixel more than 0.08 (20 levels); scanlines share the
// over-text 0.08 with grain, halftone and paper; the grain changes at its own rate; and the same
// instant is the same pixels in a fresh page. Story: tests/kit/media/finish-fx.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (finish, preset = 'kinetic', format = '9x16') => openPiece(PAGE, { server, browser, format, query: { story: 'finish-fx', preset, ...(finish ? { finishJson: JSON.stringify(finish) } : {}) } });
const shot = async (finish, opts = {}) => {
  const o = await open(finish, opts.preset, opts.format);
  try { return decodePng(await framePng(o.page, opts.t ?? 1)); } finally { await o.close(); }
};
// the largest channel step between two frames, and where the frames differ
function compare(a, b) {
  assert.equal(a.width, b.width);
  const ch = a.data.length / (a.width * a.height);
  let max = 0, changed = 0, lifted = 0, darkened = 0;
  const box = { x0: a.width, y0: a.height, x1: 0, y1: 0 };
  for (let i = 0; i < a.data.length; i += ch) {
    let step = 0, sum = 0;
    for (let c = 0; c < 3; c++) { const d = b.data[i + c] - a.data[i + c]; step = Math.max(step, Math.abs(d)); sum += d; }
    if (step > 0) {
      changed++;
      const x = (i / ch) % a.width, y = Math.floor(i / ch / a.width);
      box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y);
    }
    if (sum > 0) lifted++; else if (sum < 0) darkened++;
    max = Math.max(max, step);
  }
  return { max, changed, lifted, darkened, box };
}
const within = (img, x0, y0, x1, y1, f) => { const ch = img.data.length / (img.width * img.height); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f((y * img.width + x) * ch); };

test('the stage wears one filter, and only when chroma, bloom or a look asks for it', async () => {
  for (const [finish, want] of [[null, false], [{ grain: 0.5, vignette: 0.5 }, false], [{ look: 'neutral' }, false], [{ chroma: 0.5 }, true], [{ bloom: 0.5 }, true], [{ look: 'faded' }, true]]) {
    const o = await open(finish);
    try {
      await o.mm.seek(1);
      const r = await o.page.evaluate(() => ({ filter: document.querySelector('.mm-stage').style.filter, defs: !!document.querySelector('#mm-fx') }));
      assert.equal(r.filter === 'url("#mm-fx")' && r.defs, want, JSON.stringify([finish, r]));
    } finally { await o.close(); }
  }
});

test('chroma parts the planes toward the frame edge and leaves the middle of the frame alone', async () => {
  const flat = await shot({ vignette: 0 }), split = await shot({ chroma: 1 });
  const { width: w, height: h } = flat;
  const d = compare(flat, split);
  assert.ok(d.changed > 200, `the edges of the type part: ${d.changed} px changed`);
  // a plane sampled under half a pixel off is not moved: that is the middle 8 % across and 6 % down
  const midX0 = Math.round(w * 0.46), midX1 = Math.round(w * 0.54), midY0 = Math.round(h * 0.47), midY1 = Math.round(h * 0.53);
  let moved = 0;
  within(flat, midX0, midY0, midX1, midY1, (i) => { for (let c = 0; c < 3; c++) if (flat.data[i + c] !== split.data[i + c]) { moved++; break; } });
  assert.equal(moved, 0, 'the middle does not move');
});

test('the fringe is drawn in palette roles only: the accent shows beside the type near the rim, and no colour the palette does not own', async () => {
  const split = await shot({ chroma: 1 }), plain = await shot({ vignette: 0 });
  // kinetic: canvas #0B0D12, ink #F2F4F8, muted #8A93A6, accent #D7FF3F; a lime pixel is the accent over canvas or ink
  const lime = (img) => { let n = 0; within(img, 0, 0, img.width, img.height, (i) => { if (img.data[i + 1] > img.data[i + 2] + 70 && img.data[i] > img.data[i + 2] + 40) n++; }); return n; };
  assert.ok(lime(split) > lime(plain) + 100, `an edge of the accent: ${lime(split)} against ${lime(plain)}`);
});

test('chromaRoles names the two roles the fringe is drawn in', async () => {
  const a = await shot({ chroma: 1, chromaRoles: ['ink', 'muted'] }), b = await shot({ chroma: 1 });
  assert.ok(compare(a, b).changed > 100, 'another pair of roles, another fringe');
});

test('the fringe is drawn from the picture, not from the finish: scanlines, grain and paper are not ghosted into bands', async () => {
  const strip = (img) => {   // the mean of each 60-row block over a flat strip at the left edge
    const ch = img.data.length / (img.width * img.height), out = [];
    for (let y0 = 0; y0 < img.height; y0 += 60) {
      let sum = 0, n = 0;
      for (let y = y0; y < Math.min(img.height, y0 + 60); y++) for (let x = 0; x < 200; x++) { const i = (y * img.width + x) * ch; sum += img.data[i] + img.data[i + 1] + img.data[i + 2]; n += 3; }
      out.push(sum / n);
    }
    return Math.max(...out) - Math.min(...out);
  };
  for (const finish of [{ scanlines: 1, chroma: 1 }, { chroma: 1, grain: 0.5, scanlines: 0.4, bloom: 1, look: 'warm-print' }]) {
    const img = await shot(finish, { format: '16x9' });
    assert.ok(strip(img) < 1, `${JSON.stringify(finish)}: the rows of a flat strip differ by ${strip(img).toFixed(2)}`);
  }
});

test('bloom only ever lights the frame, by at most 0.08, around what is lighter than the canvas', async () => {
  for (const preset of ['kinetic', 'editorial']) {
    const plain = await shot(null, { preset }), glow = await shot({ bloom: 1 }, { preset });
    const d = compare(plain, glow);
    assert.ok(d.max <= Math.round(0.08 * 255) + 1, `${preset}: no pixel moves more than 0.08, moved ${d.max}`);
    assert.equal(d.darkened, 0, `${preset}: bloom adds light, never takes it`);
    if (preset === 'kinetic') assert.ok(d.lifted > 500, `${preset}: a halo round the type: ${d.lifted} px lifted`);
  }
});

test('a look never moves a pixel more than 0.08, faded lifts the blacks, and a look at 0 changes nothing', async () => {
  const plain = await shot(null);
  for (const look of ['warm-print', 'cool-print', 'faded', 'high-contrast']) {
    const d = compare(plain, await shot({ look }));
    assert.ok(d.max > 0 && d.max <= Math.round(0.08 * 255) + 1, `${look}: moved ${d.max}`);
  }
  const faded = await shot({ look: 'faded' });
  let darkest = 255; within(faded, 0, 0, faded.width, faded.height, (i) => { darkest = Math.min(darkest, faded.data[i], faded.data[i + 1], faded.data[i + 2]); });
  assert.ok(darkest >= 10, `the blacks are lifted: darkest ${darkest}`);
  assert.equal(compare(plain, await shot({ look: 'faded', lookAmount: 0 })).changed, 0, 'amount 0');
});

test('scanlines are an ink layer that lies over text, and with grain, halftone and paper they weigh 0.08 together', async () => {
  const o = await open({ grain: 1, halftone: 1, paper: 1, scanlines: 1 });
  try {
    await o.mm.seek(1);
    const r = await o.page.evaluate(() => {
      const f = document.querySelector('.mm-scene .mm-finish');
      const op = (c) => Number(getComputedStyle(f.querySelector(`.mm-finish__${c}`)).opacity);
      return { grain: op('grain'), halftone: op('halftone'), fibre: op('fibre'), scan: op('scan'), scanBg: getComputedStyle(f.querySelector('.mm-finish__scan')).backgroundImage };
    });
    const total = r.grain + r.halftone + r.fibre + r.scan;
    assert.ok(r.scan > 0 && total <= 0.08 + 1e-6, JSON.stringify(r));
    assert.match(r.scanBg, /linear-gradient/);
  } finally { await o.close(); }
});

test('the grain changes at grainRate, 12 a second by default, and holds still at 0', async () => {
  const seedAt = async (finish, t) => { const o = await open(finish); try { await o.mm.seek(t); return await o.page.evaluate(() => document.querySelector('#mm-finish-defs #mm-grain feTurbulence').getAttribute('seed')); } finally { await o.close(); } };
  assert.equal(await seedAt({ grain: 1 }, 1.01), await seedAt({ grain: 1 }, 1.02));
  assert.notEqual(await seedAt({ grain: 1 }, 1.01), await seedAt({ grain: 1 }, 1.1));
  assert.equal(await seedAt({ grain: 1, grainRate: 24 }, 1.01), await seedAt({ grain: 1, grainRate: 24 }, 1.03));
  assert.notEqual(await seedAt({ grain: 1, grainRate: 24 }, 1.0), await seedAt({ grain: 1, grainRate: 24 }, 1.05));
  assert.equal(await seedAt({ grain: 1, grainRate: 0 }, 0.3), await seedAt({ grain: 1, grainRate: 0 }, 2.9));
});

test('every filter finish draws the same pixels for the same instant in a fresh page', async () => {
  const all = { chroma: 0.8, bloom: 0.8, look: 'warm-print', scanlines: 0.5, grain: 0.4, grainRate: 24 };
  for (const t of [0.4, 1.7]) {
    const a = await shot(all, { t }), b = await shot(all, { t });
    assert.equal(compare(a, b).changed, 0, `t ${t}`);
  }
});

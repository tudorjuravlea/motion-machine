// mm media layers: one still picture becomes a plate and parts with boxes and depths, offline, from
// masks the user supplies, a flat-background colour key, or polygons. Stacking the plate and the parts
// gives the source back (at most 0.1 % of pixels further than ΔE 10 from it); the same inputs give the
// same bytes. Inputs come from fixtures/layers/ (invented pictures drawn by fixtures/layers/make.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';
import { decodePng, deltaE, rgbToLab } from '../../scripts/check/_pixels.mjs';
import { encodePng } from '../../scripts/lib/layers-png.mjs';
import { rasterPolygon, pushPull, layerFiles, recompose, seededRandom } from '../../scripts/lib/layers.mjs';

const FIX = join(ROOT, 'fixtures', 'layers');
const work = join(ROOT, `.tmp-cli-layers-${process.pid}`);
const f = (n) => join(FIX, n);
const run = (args, name, piece = work) => mm(['media', 'layers', ...args, '--name', name, '--piece', piece]);
const meta = (name, piece = work) => JSON.parse(readFileSync(join(piece, 'assets', name, 'media.json'), 'utf8'));
const png = (name, file, piece = work) => decodePng(readFileSync(join(piece, 'assets', name, file)));
const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
const SCENE = ['--mask', `sun=${f('sun-mask.png')}`, '--mask', `box=${f('box-cutout.png')}`, '--poly', f('hill.json')];

/** Stacks plate + parts in z order (independent of the tool) and returns the share of pixels further than ΔE 10 from the source. */
function stack(name, piece = work) {
  const m = meta(name, piece);
  const src = png(name, m.source.file, piece), out = Float64Array.from(png(name, m.plate.file, piece).data);
  for (const p of [...m.parts].sort((a, b) => a.z - b.z)) {
    const im = png(name, p.file, piece);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4, o = ((p.y + y) * m.w + p.x + x) * 4, a = im.data[i + 3] / 255;
      for (let c = 0; c < 3; c++) out[o + c] = im.data[i + c] * a + out[o + c] * (1 - a);
    }
  }
  let off = 0;
  for (let i = 0; i < m.w * m.h; i++) {
    const q = [0, 1, 2].map((c) => Math.round(out[i * 4 + c])), s = [0, 1, 2].map((c) => src.data[i * 4 + c]);
    if (deltaE(rgbToLab(...q), rgbToLab(...s)) > 10) off++;
  }
  return off / (m.w * m.h);
}

before(() => { rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); });
after(() => rmSync(work, { recursive: true, force: true }));

test('encodePng writes RGBA and grey PNGs that decode to the same pixels, the same bytes every time', () => {
  const data = Buffer.from(Array.from({ length: 5 * 3 * 4 }, (_, i) => (i * 37) % 256));
  const a = encodePng({ width: 5, height: 3, data });
  assert.deepEqual(decodePng(a).data, data);
  assert.ok(encodePng({ width: 5, height: 3, data }).equals(a));
  const grey = Buffer.from([0, 40, 80, 120, 160, 200]);
  const g = decodePng(encodePng({ width: 3, height: 2, data: grey }, { channels: 1 }));
  assert.deepEqual([...g.data].filter((_, i) => i % 4 === 0), [...grey]);
});

test('rasterPolygon covers the inside fully, the outside not at all and a half-pixel edge by half', () => {
  const a = rasterPolygon([[2, 2], [6.5, 2], [6.5, 6], [2, 6]], 8, 8);
  assert.equal(a[3 * 8 + 3], 255);
  assert.equal(a[0], 0);
  assert.equal(a[7 * 8 + 7], 0);
  assert.ok(Math.abs(a[3 * 8 + 6] - 128) <= 8, `half edge ${a[3 * 8 + 6]}`);
});

test('pushPull fills a hole from its surroundings and changes nothing outside it', () => {
  const w = 16, h = 8, data = Buffer.alloc(w * h * 4), hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = x * 16; data[i + 1] = 90; data[i + 2] = 200; data[i + 3] = 255; }
  for (let y = 2; y < 6; y++) for (let x = 6; x < 10; x++) hole[y * w + x] = 1;
  const out = pushPull({ width: w, height: h, data }, hole, { grain: 0 });
  for (let i = 0; i < w * h; i++) if (!hole[i]) assert.equal(out[i * 4], data[i * 4]);
  for (let y = 2; y < 6; y++) for (let x = 6; x < 10; x++) {
    const i = (y * w + x) * 4;
    assert.ok(out[i] >= 80 && out[i] <= 160, `fill ${out[i]} between the neighbours`);
    assert.equal(out[i + 1], 90); assert.equal(out[i + 2], 200);
  }
});

test('masks and polygons: a plate and three parts with boxes, z and depth that stack back to the source', () => {
  const r = run([f('scene.png'), ...SCENE], 'scene');
  assert.equal(r.status, 0, r.out);
  const m = meta('scene');
  assert.equal(m.kind, 'layers');
  assert.equal(m.w, 480); assert.equal(m.h, 320);
  assert.equal(m.source.from, 'scene.png'); assert.match(m.source.sha1, /^[0-9a-f]{40}$/);
  assert.deepEqual(m.parts.map((p) => p.name), ['sun', 'box', 'hill']);
  assert.deepEqual(m.parts.map((p) => p.z), [0, 1, 2]);
  for (const p of m.parts) {
    assert.ok(p.w > 0 && p.h > 0 && p.x >= 0 && p.y >= 0 && p.x + p.w <= m.w && p.y + p.h <= m.h, `${p.name} box`);
    assert.ok(p.depth >= 0 && p.depth <= 1, `${p.name} depth ${p.depth}`);
    const im = png('scene', p.file);
    assert.equal(im.width, p.w); assert.equal(im.height, p.h);
  }
  for (const file of layerFiles(m)) assert.ok(existsSync(join(work, 'assets', 'scene', file)), file);
  assert.ok(m.recompose.offShare <= 0.001, `tool says ${m.recompose.offShare}`);
  assert.equal(m.recompose.ok, true);
  assert.equal(m.recompose.unit, 'ΔE76'); assert.equal(m.recompose.threshold, 10); assert.equal(m.recompose.limit, 0.001);
  const share = stack('scene');
  assert.ok(share <= 0.001, `restacked ${share}`);
  // the plate no longer holds the sun: its centre is sky, not the sun's yellow
  const plate = png('scene', m.plate.file), sun = png('scene', m.parts[0].file);
  const sc = m.parts[0], cx = sc.x + Math.floor(sc.w / 2), cy = sc.y + Math.floor(sc.h / 2);
  const pi = (cy * m.w + cx) * 4, si = (Math.floor(sc.h / 2) * sc.w + Math.floor(sc.w / 2)) * 4;
  assert.ok(Math.abs(plate.data[pi + 2] - sun.data[si + 2]) > 60, `plate ${plate.data.slice(pi, pi + 3)} vs sun ${sun.data.slice(si, si + 3)}`);
});

test('the same inputs write the same bytes on a second run', () => {
  const a = join(work, 'a'), b = join(work, 'b');
  assert.equal(run([f('scene.png'), ...SCENE, '--depth', f('depth.png')], 'twice', a).status, 0);
  assert.equal(run([f('scene.png'), ...SCENE, '--depth', f('depth.png')], 'twice', b).status, 0);
  const files = readdirSync(join(a, 'assets', 'twice')).sort();
  assert.deepEqual(readdirSync(join(b, 'assets', 'twice')).sort(), files);
  for (const n of files) assert.equal(sha(join(b, 'assets', 'twice', n)), sha(join(a, 'assets', 'twice', n)), n);
  assert.ok(files.includes('depth.png'));
  // nothing in media.json depends on when or where it ran: no date, time or absolute path
  const text = readFileSync(join(a, 'assets', 'twice', 'media.json'), 'utf8');
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|"\/(Users|home|tmp|private)\//);
});

test('depth: a supplied map gives each part its mean depth; a list sets constants; by default depth follows the stacking order', () => {
  const byMap = meta('twice', join(work, 'a'));
  const d = Object.fromEntries(byMap.parts.map((p) => [p.name, p.depth]));
  assert.ok(Math.abs(d.sun - 30 / 255) < 0.02, `sun ${d.sun}`);
  assert.ok(Math.abs(d.box - 230 / 255) < 0.02, `box ${d.box}`);
  assert.equal(byMap.depth.file, 'depth.png');
  assert.equal(byMap.depthFrom, 'map');
  // depth.png is the plate's depth: under the sun it is the sky's ramp (about 80), not the sun's 30
  const sunPart = byMap.parts[0], dm = png('twice', 'depth.png', join(work, 'a'));
  const at = ((sunPart.y + (sunPart.h >> 1)) * byMap.w + sunPart.x + (sunPart.w >> 1)) * 4;
  assert.ok(Math.abs(dm.data[at] - 80) <= 12, `plate depth under the sun ${dm.data[at]}`);
  assert.ok(Math.abs(byMap.plate.depth - 0.45) < 0.15, `plate depth ${byMap.plate.depth}`);
  assert.equal(run([f('scene.png'), ...SCENE, '--depths', '0.1,0.9,0.5'], 'list').status, 0);
  assert.deepEqual(meta('list').parts.map((p) => p.depth), [0.1, 0.9, 0.5]);
  assert.equal(meta('list').depthFrom, 'list');
  const byOrder = meta('scene');
  assert.equal(byOrder.depthFrom, 'order');
  const ds = byOrder.parts.map((p) => p.depth);
  assert.ok(ds[0] < ds[1] && ds[1] < ds[2], ds.join());
  assert.equal(byOrder.plate.depth, 0);
});

test('colour key: a flat background splits into its shapes in reading order, and the plate is the background', () => {
  const r = run([f('logo.png'), '--key', 'auto'], 'logo');
  assert.equal(r.status, 0, r.out);
  const m = meta('logo');
  assert.deepEqual(m.parts.map((p) => p.name), ['part-1', 'part-2', 'part-3']);
  const xs = m.parts.map((p) => p.x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], `reading order ${xs}`);
  assert.ok(stack('logo') <= 0.001);
  const plate = png('logo', m.plate.file);
  for (const p of m.parts) {
    const i = ((p.y + (p.h >> 1)) * m.w + p.x + (p.w >> 1)) * 4;
    for (const [c, v] of [[0, 0xEE], [1, 0xE8], [2, 0xDC]]) assert.ok(Math.abs(plate.data[i + c] - v) <= 6, `${p.name} plate ${plate.data.slice(i, i + 3)}`);
  }
  assert.equal(run([f('logo.png'), '--key', '#eee8dc'], 'logo-hex').status, 0);
  assert.equal(meta('logo-hex').parts.length, 3);
});

test('a plate the user supplies is used as it is', () => {
  assert.equal(run([f('scene.png'), ...SCENE, '--plate', f('scene.png')], 'kept').status, 0);
  const m = meta('kept');
  assert.equal(m.plate.fill, 'supplied');
  assert.deepEqual(png('kept', m.plate.file).data, png('kept', m.source.file).data);
  assert.ok(stack('kept') <= 0.001);
});

test('recompose finds a part that no longer matches the source and exits 1 with a grey error map', () => {
  const r = run([f('logo.png'), '--key', 'auto'], 'broken');
  assert.equal(r.status, 0, r.out);
  const m = meta('broken'), first = m.parts[0];
  const im = png('broken', first.file);
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] > 0) im.data[i] = 255 - im.data[i];
  writeFileSync(join(work, 'assets', 'broken', first.file), encodePng(im));
  const check = recompose(join(work, 'assets', 'broken'));
  assert.equal(check.ok, false);
  assert.ok(check.offShare > 0.001, String(check.offShare));
  // a supplied plate that is not the picture leaves the stack far from the source: exit 1, pack written, error map
  const wrong = run([f('scene.png'), ...SCENE, '--plate', f('depth.png')], 'wrong-plate');
  assert.equal(wrong.status, 1, wrong.out);
  assert.match(wrong.stderr, /do not recompose/);
  assert.equal(meta('wrong-plate').recompose.ok, false);
  // the error map is grey: dark where the stack matches, brighter with the error, white where it is off
  const map = png('wrong-plate', 'recompose-off.png');
  let white = 0;
  for (let i = 0; i < map.data.length; i += 4) {
    assert.ok(map.data[i] === map.data[i + 1] && map.data[i + 1] === map.data[i + 2], 'grey');
    if (map.data[i] === 255) white++;
  }
  assert.equal(white, meta('wrong-plate').recompose.offPixels);
});

test('usage mistakes exit 2 with one line and no stack', () => {
  const cases = [
    [[f('scene.png')], 'none', /--mask, --key or --poly/],
    [[f('scene.png'), '--key', 'auto', '--mask', `sun=${f('sun-mask.png')}`], 'both', /--key/],
    [[f('scene.png'), '--mask', `sun=${f('logo.png')}`], 'size', /480x320/],
    [[f('scene.png'), '--mask', f('sun-mask.png')], 'unnamed', /name=/],
    [[f('scene.png'), '--mask', `sun=${f('missing.png')}`], 'missing', /no such file/],
    [[f('scene.png'), ...SCENE, '--depths', '0.1,0.2'], 'count', /3 parts/],
    [[f('logo.png'), '--key', 'teal'], 'colour', /#rrggbb or auto/],
  ];
  for (const [args, name, re] of cases) {
    const r = run(args, name);
    assert.equal(r.status, 2, `${name}: ${r.out}`);
    assert.match(r.stderr, re, name);
    assert.doesNotMatch(r.out, /\n\s+at |node:internal/);
  }
  const bad = run([f('scene.png'), ...SCENE], 'Bad Name');
  assert.equal(bad.status, 2);
  assert.equal(mm(['media', 'layers', '--help']).status, 0);
});

/** A 240 x 140 picture: a flat background with Gaussian noise of standard deviation `sd` (seeded), and two flat shapes. */
function noisy(file, sd) {
  const w = 240, h = 140, data = Buffer.alloc(w * h * 4), rnd = seededRandom(7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const base = x >= 30 && x < 90 && y >= 40 && y < 100 ? [40, 90, 160] : (x - 170) ** 2 + (y - 70) ** 2 < 900 ? [200, 60, 40] : [230, 226, 214];
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round(base[c] + sd * gauss())));
    data[i + 3] = 255;
  }
  writeFileSync(file, encodePng({ width: w, height: h, data }));
  return file;
}

test('--key auto ignores specks of background noise smaller than the minimum part size; --min-area sets it', async () => {
  const pic = noisy(join(work, 'noisy-8.png'), 8);
  const r = run([pic, '--key', 'auto'], 'noisy');
  assert.equal(r.status, 0, r.out);
  assert.equal(meta('noisy').parts.length, 2, JSON.stringify(meta('noisy').parts.map((p) => [p.x, p.y, p.w, p.h])));
  // a minimum between the disc (about 2800 px, 3200 with its averaged edge) and the square (3600, 4100):
  // the disc goes, the square stays (the script's own entry, which --min-area reaches)
  const { layers } = await import('../../scripts/media-layers.mjs');
  layers({ file: pic, name: 'big-only', piece: work, key: 'auto', minPart: '3800' });
  const kept = meta('big-only').parts;
  assert.equal(kept.length, 1);
  assert.ok(Math.abs(kept[0].x - 30) <= 2 && Math.abs(kept[0].y - 40) <= 2, `the square, at ${kept[0].x}, ${kept[0].y}`);
  assert.throws(() => layers({ file: pic, name: 'bad-area', piece: work, key: 'auto', minPart: 'many' }), (e) => e.exitCode === 2 && /--min-area takes a whole number/.test(e.message));
});

test('--key on a background too rough to key names the cause instead of writing one part as big as the picture', () => {
  // a backdrop that runs from light to dark across the picture: no single colour keys it
  const w = 240, h = 140, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = Math.round(235 - (x / w) * 140); data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  const pic = join(work, 'ramp.png');
  writeFileSync(pic, encodePng({ width: w, height: h, data }));
  const r = run([pic, '--key', 'auto'], 'rough');
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /background is not flat enough for --key/);
});

test('a mask over the whole picture gives a plate made from the picture itself, softened, with a warning (never black)', () => {
  const full = join(work, 'full-mask.png');
  writeFileSync(full, encodePng({ width: 480, height: 320, data: Buffer.alloc(480 * 320 * 4, 255) }));
  const r = run([f('scene.png'), '--mask', `all=${full}`], 'full');
  assert.equal(r.status, 0, r.out);
  assert.match(r.stderr, /warning: .*every pixel is under a part/);
  const m = meta('full');
  assert.equal(m.plate.fill, 'soft-copy');
  const plate = png('full', m.plate.file), src = png('full', m.source.file);
  let ps = 0, ss = 0, dark = 0;
  for (let i = 0; i < plate.data.length; i += 4) {
    ps += plate.data[i] + plate.data[i + 1] + plate.data[i + 2]; ss += src.data[i] + src.data[i + 1] + src.data[i + 2];
    if (plate.data[i] + plate.data[i + 1] + plate.data[i + 2] < 15) dark++;
  }
  assert.ok(Math.abs(ps - ss) / ss < 0.05, `plate brightness ${ps} vs source ${ss}`);
  assert.equal(dark, 0, 'no black pixels');
});

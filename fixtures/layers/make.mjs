// Draws the invented pictures the layer tests and demos use: flat shapes over gradients, nothing
// photographed. `node fixtures/layers/make.mjs [outDir] [scale] [grain] [shape]` writes, at 480 x 320 times
// scale (grain: the amplitude of the seeded noise in levels, 6 by default; shape `square`: a 400 x 400
// scene whose sun, box and hill sit inside its central 56 %, which a full-bleed frame of any format keeps):
//   scene.png       a sky over a field, a sun, a hill, a box on the field, seeded grain
//   sun-mask.png    the sun as a grey mask
//   box-cutout.png  the box as an RGBA cut-out (the picture's own pixels, alpha = the box)
//   hill.json       the hill as a polygon part
//   depth.png       a grey depth map, near = white (sun 30, sky to field 40 to 200, hill 170, box 230)
//   logo.png        three flat shapes on a flat background (360 x 200 times scale), for the colour key
// Run with no arguments it rewrites the fixtures in this folder.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../../scripts/lib/layers-png.mjs';
import { rasterPolygon, seededRandom } from '../../scripts/lib/layers.mjs';

const out = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
const k = Number(process.argv[3] ?? 1), grain = Number(process.argv[4] ?? 6), square = process.argv[5] === 'square';
mkdirSync(out, { recursive: true });

const circle = (cx, cy, r, n = 96) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const sc = (pts) => pts.map(([x, y]) => [x * k, y * k]);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function canvas(w, h, at) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = at(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { width: w, height: h, data, f: Float64Array.from(data) };
}
function paint(img, alpha, color) {
  for (let i = 0; i < img.width * img.height; i++) {
    const a = alpha[i] / 255;
    if (!a) continue;
    const c = typeof color === 'function' ? color(i % img.width, Math.floor(i / img.width)) : color;
    for (let ch = 0; ch < 3; ch++) img.f[i * 4 + ch] = c[ch] * a + img.f[i * 4 + ch] * (1 - a);
  }
}
const bytes = (img) => { for (let i = 0; i < img.f.length; i++) img.data[i] = Math.round(img.f[i]); return img; };

// the scene
const W = (square ? 400 : 480) * k, H = (square ? 400 : 320) * k, horizon = (square ? 205 : 200) * k;
const scene = canvas(W, H, (x, y) => (y < horizon ? mix([84, 136, 201], [198, 219, 236], y / horizon) : mix([118, 156, 92], [78, 108, 58], (y - horizon) / (H - horizon))));
const G = square
  ? { sun: [172, 160, 30], box: [228, 168, 298, 238], hill: [[0, 400], [0, 262], [60, 246], [110, 236], [150, 234], [190, 240], [220, 254], [236, 270], [236, 400]] }
  : { sun: [110, 80, 36], box: [292, 150, 392, 250], hill: [[0, 320], [0, 250], [50, 232], [100, 222], [150, 218], [200, 222], [250, 236], [280, 252], [280, 320]] };
const sunPts = sc(circle(...G.sun)), boxPts = sc(rect(...G.box));
const hillPts = sc(G.hill);
const sun = rasterPolygon(sunPts, W, H), box = rasterPolygon(boxPts, W, H), hill = rasterPolygon(hillPts, W, H);
paint(scene, sun, [250, 205, 82]);
paint(scene, box, (x, y) => mix([206, 74, 58], [148, 50, 44], (y - G.box[1] * k) / ((G.box[3] - G.box[1]) * k)));
const hillTop = Math.min(...G.hill.map((q) => q[1]));
paint(scene, hill, (x, y) => mix([72, 138, 82], [46, 98, 60], (y - hillTop * k) / (H - hillTop * k)));
const rnd = seededRandom(7);
for (let i = 0; i < W * H; i++) { const g = (rnd() - 0.5) * grain; for (let ch = 0; ch < 3; ch++) scene.f[i * 4 + ch] = Math.min(255, Math.max(0, scene.f[i * 4 + ch] + g)); }
bytes(scene);
writeFileSync(join(out, 'scene.png'), encodePng(scene));
writeFileSync(join(out, 'sun-mask.png'), encodePng({ width: W, height: H, data: sun }, { channels: 1 }));
const cut = Buffer.from(scene.data);
for (let i = 0; i < W * H; i++) { cut[i * 4 + 3] = box[i]; if (!box[i]) cut[i * 4] = cut[i * 4 + 1] = cut[i * 4 + 2] = 0; }
writeFileSync(join(out, 'box-cutout.png'), encodePng({ width: W, height: H, data: cut }));
writeFileSync(join(out, 'hill.json'), `${JSON.stringify({ parts: [{ name: 'hill', points: hillPts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) }] }, null, 2)}\n`);
const depth = canvas(W, H, (x, y) => { const v = 40 + 160 * (y / H); return [v, v, v]; });
paint(depth, sun, [30, 30, 30]);
paint(depth, box, [230, 230, 230]);
paint(depth, hill, [170, 170, 170]);
writeFileSync(join(out, 'depth.png'), encodePng(bytes(depth), { channels: 1 }));

// the flat-background picture
const LW = 360 * k, LH = 200 * k;
const logo = canvas(LW, LH, () => [0xee, 0xe8, 0xdc]);
paint(logo, rasterPolygon(sc(circle(70, 100, 40)), LW, LH), [225, 110, 40]);
paint(logo, rasterPolygon(sc(rect(140, 60, 220, 140)), LW, LH), [30, 130, 130]);
paint(logo, rasterPolygon(sc([[250, 140], [330, 140], [290, 60]]), LW, LH), [40, 40, 50]);
writeFileSync(join(out, 'logo.png'), encodePng(bytes(logo)));
console.log(`wrote the layer fixtures (${W}x${H}) to ${out}`);

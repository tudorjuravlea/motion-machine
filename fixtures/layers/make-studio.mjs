// Draws an invented product still for the depth-parallax demo: flat shapes, gradients and fine lines,
// nothing photographed. A tiled back wall, a shelf with two vases, a table receding toward the camera, a
// cup on the table and a bottle in front. The fine tile lines and the grain show how far each depth is
// from the focus. `node fixtures/layers/make-studio.mjs <outDir>` writes, at 1600 x 900:
//   studio.png        the picture
//   studio-plate.png  the same room with nothing on the shelf, the table or in front (a clean plate)
//   bottle-mask.png   the bottle as a grey mask (the nearest part)
//   cup-mask.png      the cup as a grey mask
//   shelf-mask.png    the shelf and its vases as a grey mask
//   studio-depth.png  a grey depth map, near = white (wall 25, shelf 80, table 110 to 215, cup 175, bottle 240)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encodePng } from '../../scripts/lib/layers-png.mjs';
import { rasterPolygon, seededRandom } from '../../scripts/lib/layers.mjs';

const out = resolve(process.argv[2] ?? '.');
mkdirSync(out, { recursive: true });
const W = 1600, H = 900, TABLE = 600;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const circle = (cx, cy, rx, ry = rx, n = 96) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const union = (...ms) => { const o = new Uint8Array(W * H); for (const m of ms) for (let i = 0; i < o.length; i++) o[i] = Math.max(o[i], m[i]); return o; };
const poly = (pts) => rasterPolygon(pts, W, H);

const img = new Float64Array(W * H * 3);
const fill = (at) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(x, y), i = (y * W + x) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; } };
const paint = (alpha, color) => {
  for (let i = 0; i < W * H; i++) {
    const a = alpha[i] / 255;
    if (!a) continue;
    const c = typeof color === 'function' ? color(i % W, Math.floor(i / W)) : color;
    for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = c[ch] * a + img[i * 3 + ch] * (1 - a);
  }
};

// the wall: a soft warm grey with a grid of small tiles, and the table receding below it
fill((x, y) => {
  if (y >= TABLE) {
    const t = (y - TABLE) / (H - TABLE), grainLine = Math.sin((x * 0.011 + t * 7) * 6.283) * 0.5 + 0.5;
    return mix(mix([196, 168, 138], [150, 116, 86], t), [126, 96, 70], 0.18 * grainLine);
  }
  const base = mix([232, 226, 216], [206, 199, 188], y / TABLE), gx = x % 48, gy = y % 48;
  return gx < 2 || gy < 2 ? mix(base, [150, 144, 136], 0.55) : base;
});
// the table's front edge, a darker lip at the horizon
paint(poly(rect(0, TABLE, W, TABLE + 8)), [118, 88, 62]);

// the clean plate: the room before anything is placed in it
const plate = Float64Array.from(img);

// the shelf with two vases
const plank = poly(rect(870, 330, 1560, 346)), bracket = poly(rect(1250, 346, 1262, 380));
const vaseA = union(poly(circle(1130, 288, 34, 40)), poly(rect(1098, 288, 1162, 330))), neckA = poly(rect(1118, 220, 1142, 252));
const vaseB = poly(circle(1440, 300, 30));
const shelf = union(plank, bracket, vaseA, neckA, vaseB);
paint(plank, [140, 108, 78]); paint(bracket, [110, 84, 60]);
paint(union(vaseA, neckA), (x, y) => mix([96, 132, 150], [58, 86, 104], (y - 220) / 110));
paint(vaseB, (x, y) => mix([214, 140, 96], [168, 96, 64], (y - 270) / 60));

// the cup on the table
const cupBody = poly([[1220, 640], [1340, 640], [1325, 735], [1235, 735]]);
const handle = poly([...circle(1348, 680, 24, 26).filter(([x]) => x > 1332)]);
const cup = union(cupBody, handle);
paint(cup, (x, y) => mix([244, 240, 232], [196, 190, 180], (y - 640) / 95));
paint(poly(circle(1280, 642, 58, 7)), [92, 64, 44]);

// the bottle in front, right of centre (the type sits on the left): a tall glass body, shoulders, a
// neck and a cap, lit from the left, the shelf passing behind its neck
const body = poly([[860, 430], [1000, 430], [1000, 780], [860, 780]]);
const shoulder = poly(circle(930, 432, 70, 54).filter(([, y]) => y <= 432));
const neck = poly(rect(908, 300, 952, 400)), cap = poly(rect(900, 252, 960, 302));
const bottle = union(body, shoulder, neck, cap);
paint(union(body, shoulder, neck), (x) => mix([40, 112, 108], [18, 62, 64], Math.min(1, Math.abs(x - 900) / 100)));
paint(poly(rect(878, 450, 890, 760)), [150, 206, 198]);
paint(poly(rect(872, 540, 988, 660)), [236, 230, 218]);
paint(poly(rect(890, 590, 970, 596)), [60, 70, 72]);
paint(cap, (x) => mix([70, 66, 62], [30, 28, 26], (x - 900) / 60));

// seeded grain, the same in the picture and the plate, so a defocused depth shows as a smoother texture
const rnd = seededRandom(11), grain = Float64Array.from({ length: W * H }, () => (rnd() - 0.5) * 8);
const bytes = (src) => {
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(src[i * 3 + ch] + grain[i])));
    data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
};
writeFileSync(join(out, 'studio.png'), encodePng(bytes(img)));
writeFileSync(join(out, 'studio-plate.png'), encodePng(bytes(plate)));
// the shelf's mask stops where the bottle covers it, so each pixel belongs to one part
const shelfSeen = shelf.map((v, i) => Math.min(v, 255 - bottle[i]));
for (const [name, m] of [['bottle', bottle], ['cup', cup], ['shelf', shelfSeen]]) writeFileSync(join(out, `${name}-mask.png`), encodePng({ width: W, height: H, data: m }, { channels: 1 }));

// the depth map
const depth = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = y < TABLE ? 25 : Math.round(110 + 105 * ((y - TABLE) / (H - TABLE)));
const press = (m, v) => { for (let i = 0; i < m.length; i++) if (m[i] > 127) depth[i] = v; };
press(shelf, 80); press(cup, 175); press(bottle, 240);
writeFileSync(join(out, 'studio-depth.png'), encodePng({ width: W, height: H, data: depth }, { channels: 1 }));
console.log(`wrote the studio picture (${W}x${H}) to ${out}`);

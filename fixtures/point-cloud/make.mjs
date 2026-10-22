// Draws the invented product pictures the particle-object tests and demo use: a bottle shaded as a lit
// cylinder (a glass body, a vivid label band, a satin cap, a specular stripe), nothing photographed.
// `node fixtures/point-cloud/make.mjs [outDir]` writes, at 360 x 760:
//   bottle.png           the bottle as an RGBA cut-out (transparent ground, antialiased outline)
//   bottle-flat.png      the same bottle on a flat light ground, no alpha (for the colour key)
//   bottle-depth.png     a grey depth map of bottle-flat.png: the cylinder near (white), the ground black
//   bottle-gradient.png  the bottle on a graded ground, no alpha (a picture the key refuses)
// Run with no arguments it rewrites the pictures in assets/ next to this file.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../../scripts/lib/layers-png.mjs';

const out = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'assets'));
mkdirSync(out, { recursive: true });
const W = 360, H = 760, CX = 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// the bottle's half-width at height y (0 outside it): a rounded cap, a neck, a shoulder, the body, a rounded base
function halfWidth(y) {
  if (y < 40 || y > 730) return 0;
  if (y < 50) return 36 + Math.sqrt(Math.max(0, 100 - (50 - y) ** 2));
  if (y < 120) return 46;
  if (y < 170) return 36;
  if (y < 260) return 36 + 74 * smooth(170, 260, y);
  if (y < 700) return 110;
  return 80 + Math.sqrt(Math.max(0, 900 - (y - 700) ** 2));
}
const inside = (x, y) => Math.abs(x - CX) <= halfWidth(y);

// the bottle's colour at a pixel centre: a cylinder lit from the upper left, with a specular stripe
function shade(x, y) {
  const hw = halfWidth(y) || 1, u = Math.max(-1, Math.min(1, (x - CX) / hw)), nz = Math.sqrt(1 - u * u);
  const diffuse = 0.3 + 0.7 * clamp01(-0.45 * u + 0.85 * nz);
  const stripe = Math.exp(-(((u + 0.42) / 0.07) ** 2)), rim = 0.35 * Math.exp(-(((u - 0.82) / 0.06) ** 2));
  let base;
  if (y < 120) base = [92, 96, 108];                                  // the satin cap
  else if (y < 170) base = [60, 150, 158];                            // the neck
  else if (y >= 420 && y < 560) base = y >= 442 && y < 452 ? [246, 226, 190] : [236, 92, 42];   // the label band and its cream line
  else base = mix([34, 140, 150], [18, 92, 110], smooth(260, 720, y)); // the glass body, deeper toward the base
  const lit = base.map((v) => v * diffuse);
  return mix(lit, [255, 255, 255], clamp01(stripe * (y < 120 ? 0.7 : 0.85) + rim)).map((v) => Math.round(Math.max(0, Math.min(255, v))));
}

// 4 x 4 supersampled coverage, so the outline is antialiased
function coverage(x, y) {
  let c = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) c++;
  return c / 16;
}

function picture(ground) {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = coverage(x, y), i = (y * W + x) * 4;
    const c = a > 0 ? shade(x + 0.5, y + 0.5) : [0, 0, 0];
    if (ground) {
      const g = ground(x, y);
      for (let k = 0; k < 3; k++) data[i + k] = Math.round(c[k] * a + g[k] * (1 - a));
      data[i + 3] = 255;
    } else {
      for (let k = 0; k < 3; k++) data[i + k] = c[k];
      data[i + 3] = Math.round(a * 255);
    }
  }
  return { width: W, height: H, data };
}

function depth() {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = coverage(x, y), hw = halfWidth(y + 0.5) || 1, u = Math.max(-1, Math.min(1, (x + 0.5 - CX) / hw));
    const v = Math.round(a * 255 * (0.55 + 0.4 * Math.sqrt(1 - u * u))), i = (y * W + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}

writeFileSync(join(out, 'bottle.png'), encodePng(picture(null)));
writeFileSync(join(out, 'bottle-flat.png'), encodePng(picture(() => [222, 224, 228])));
writeFileSync(join(out, 'bottle-depth.png'), encodePng(depth()));
writeFileSync(join(out, 'bottle-gradient.png'), encodePng(picture((x, y) => [Math.round(40 + (x / W) * 180), 70, Math.round(200 - (y / H) * 150)])));

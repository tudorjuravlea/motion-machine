// points: a picture rebuilt as a free-floating object of points, and the closed-form pieces of revealing
// it. samplePicture reads an RGBA picture (a cut-out product shot, a mark rasterised from SVG, a line of
// text drawn off screen) and returns seeded points on its opaque pixels, each with that pixel's colour
// and a depth: flat, a brightness relief, a supplied depth map (its far ground removed), an extrusion (a
// front and a back face and walls along the outline) or a pillow (the cut-out inflated by its distance
// field: a front and a back surface and points inside the shell). keyBackground turns a flat ground
// transparent; distanceField measures how deep each opaque pixel lies. paletteRamp maps a picture's tones
// onto brand roles. flowOf is a divergence-free swirl and flightOf a point's whole flight through the
// reveal (a seed, a burst, a front that sends it home) as a pure function of progress. Pure in their
// arguments: Node runs them as the browser does.
import { random } from './random.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// relative brightness of sRGB codes, 0..1; integer weights so black is exactly 0 and white exactly 1
const lumOf = (r, g, b) => (2126 * r + 7152 * g + 722 * b) / 2550000;
// the share of points on each face of an extruded solid (front, back, walls) and of a pillow (front, back, inside)
const EXTRUDE = [0.6, 0.2, 0.2];
const PILLOW = [0.42, 0.42, 0.16];
const VIVID_FLOOR = 0.12;  // where on the tone scale the lightest vivid pixel sits
const OVER = 1.02;  // the jittered grid's cells, one point each: a seeded pick trims the few extra, so the spread stays even

/**
 * Points on a picture's opaque pixels. `pic` is { width, height, data } (RGBA bytes, as ImageData).
 * Options: count, seed, relief ('flat' | 'luma' | 'map' | 'extrude' | 'pillow'), depth (a share of the
 * short side), depthMap (an RGBA picture of any size: white is near), depthMin (0..1: a pixel whose
 * depth is below it is ground and takes no point), alphaMin (0..255), jitter (each point moved in depth
 * by up to ± jitter × depth / 2, so a surface has a thickness).
 * A pillow inflates the cut-out by its distance field: at a pixel `d` px inside the outline, with the
 * deepest pixel `R` px inside, the surfaces sit at ±depth/2 × √(1 − (1 − d/R)²), round at the rim and
 * a full depth apart at the core; a share of the points fill the shell between them.
 * Returns { count, width, height, area, pos, rgb, face }: area is the number of opaque pixels; pos
 * (Float64Array, x y z per point) is in picture pixels with the origin at its centre, y up and z toward
 * the viewer; rgb (Uint8Array) the pixel's colour; face (Uint8Array) 0 front, 1 back, 2 wall or inside.
 * The order is a seeded shuffle, so every prefix is spread over the whole picture.
 */
export function samplePicture(pic, { count, seed = 0, relief = 'flat', depth = 0.2, depthMap = null, depthMin = 0, alphaMin = 128, jitter = 0 } = {}) {
  const { width: w, height: h, data } = pic;
  const rnd = random(seed), wobble = random(seed ^ 0x27d4eb2f);
  const mapAt = (x, y) => {
    const mx = Math.min(depthMap.width - 1, Math.floor((x / w) * depthMap.width)), my = Math.min(depthMap.height - 1, Math.floor((y / h) * depthMap.height));
    const q = (my * depthMap.width + mx) * 4;
    return lumOf(depthMap.data[q], depthMap.data[q + 1], depthMap.data[q + 2]);
  };
  const near = relief === 'map' && depthMap && depthMin > 0;
  const opaque = (x, y) => data[(y * w + x) * 4 + 3] >= alphaMin && (!near || mapAt(x + 0.5, y + 0.5) >= depthMin);
  let area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) area++;
  const D = depth * Math.min(w, h);
  const field = relief === 'pillow' ? distanceField(pic, alphaMin) : null;
  const xs = [], ys = [], zs = [], fs = [];
  const shares = relief === 'extrude' ? EXTRUDE : relief === 'pillow' ? PILLOW : [1];
  const want = shares.map((s) => Math.round(count * s));
  want[0] += count - want.reduce((a, b) => a + b, 0);
  if (area > 0) {
    // the faces (and a pillow's inside): a jittered grid over the picture, one cell after another, two draws per cell
    for (let f = 0; f < shares.length; f++) {
      if (f === 2 && relief === 'extrude') continue;
      const m = want[f];
      if (m <= 0) continue;
      const s = Math.sqrt(area / (m * OVER));
      const cand = [];
      for (let y0 = 0; y0 < h; y0 += s) for (let x0 = 0; x0 < w; x0 += s) {
        const x = x0 + rnd() * s, y = y0 + rnd() * s;
        if (x < w && y < h && opaque(x | 0, y | 0)) cand.push(x, y);
      }
      let k = pick(cand, m, rnd);
      // a grid that fell short (a thin or ragged shape) is topped up with seeded points on opaque pixels
      for (let tries = 0; k < m && tries < m * 50; tries++) {
        const x = rnd() * w, y = rnd() * h;
        if (opaque(x | 0, y | 0)) { cand[k * 2] = x; cand[k * 2 + 1] = y; k++; }
      }
      for (let i = 0; i < k; i++) { xs.push(cand[i * 2]); ys.push(cand[i * 2 + 1]); zs.push(f === 0 ? D / 2 : f === 1 ? -D / 2 : 0); fs.push(f); }
    }
    // the walls: points on the outline's pixels, spread through the depth
    if (relief === 'extrude' && want[2] > 0) {
      const edge = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!opaque(x, y)) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) edge.push(x, y);
      }
      const E = edge.length / 2;
      for (let i = 0; i < want[2] && E; i++) {
        const e = Math.floor(rnd() * E);
        xs.push(edge[e * 2] + rnd()); ys.push(edge[e * 2 + 1] + rnd()); zs.push((rnd() - 0.5) * D); fs.push(2);
      }
    }
  }
  const n = xs.length;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const pos = new Float64Array(n * 3), rgb = new Uint8Array(n * 3), face = new Uint8Array(n);
  for (let o = 0; o < n; o++) {
    const i = order[o], x = xs[i], y = ys[i];
    const p = ((y | 0) * w + (x | 0)) * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    let z = zs[i];
    if (relief === 'luma') z = (lumOf(r, g, b) - 0.5) * D;
    else if (relief === 'map' && depthMap) z = (mapAt(x, y) - 0.5) * D;
    else if (relief === 'pillow') {
      const d = Math.min(1, sampleField(field, x - 0.5, y - 0.5) / (field.max || 1));
      const top = (D / 2) * Math.sqrt(1 - (1 - d) * (1 - d));
      z = fs[i] === 0 ? top : fs[i] === 1 ? -top : (wobble() * 2 - 1) * top;
    } else if (relief !== 'extrude') z = 0;
    if (jitter > 0) z += (wobble() - 0.5) * jitter * D;
    pos[o * 3] = x - w / 2; pos[o * 3 + 1] = h / 2 - y; pos[o * 3 + 2] = z;
    rgb[o * 3] = r; rgb[o * 3 + 1] = g; rgb[o * 3 + 2] = b;
    face[o] = fs[i];
  }
  return { count: n, width: w, height: h, area, pos, rgb, face };
}

// the field bilinearly at a point in pixel-centre coordinates
function sampleField({ dist, width: w, height: h }, x, y) {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = clamp01(x - x0), fy = clamp01(y - y0);
  const a = dist[y0 * w + x0] + (dist[y0 * w + x1] - dist[y0 * w + x0]) * fx;
  const b = dist[y1 * w + x0] + (dist[y1 * w + x1] - dist[y1 * w + x0]) * fx;
  return a + (b - a) * fy;
}

/**
 * How deep each opaque pixel lies: its distance in px to the outline (to the nearest transparent pixel,
 * less half a pixel; the picture's outside counts as transparent), 0 on a transparent pixel. An exact
 * Euclidean distance transform (the lower envelope of parabolas, a row pass and a column pass).
 * Returns { dist (Float32Array, w × h), max, width, height }.
 */
export function distanceField(pic, alphaMin = 128) {
  const { width: w, height: h, data } = pic;
  const W = w + 2, H = h + 2, INF = 1e20, g = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x > 0 && y > 0 && x <= w && y <= h && data[((y - 1) * w + (x - 1)) * 4 + 3] >= alphaMin;
    g[y * W + x] = inside ? INF : 0;
  }
  const line = (get, set, n) => {
    const f = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) f[i] = get(i);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; set(q, (q - v[k]) * (q - v[k]) + f[v[k]]); }
  };
  for (let y = 0; y < H; y++) line((i) => g[y * W + i], (i, val) => { g[y * W + i] = val; }, W);
  for (let x = 0; x < W; x++) line((i) => g[i * W + x], (i, val) => { g[i * W + x] = val; }, H);
  const dist = new Float32Array(w * h);
  let max = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d2 = g[(y + 1) * W + x + 1], d = d2 > 0 ? Math.sqrt(d2) - 0.5 : 0;
    dist[y * w + x] = d;
    if (d > max) max = d;
  }
  return { dist, max, width: w, height: h };
}

/**
 * A flat ground keyed away. A picture that already has a transparent ground (more than 2 % of its pixels
 * below half alpha) comes back as it is ({ pic, cut: true }). Otherwise its border's median colour is the
 * ground: when at least `flat` of the border lies within `tolerance` of it (a share of the RGB cube's
 * diagonal), every pixel connected to the border within that tolerance turns transparent, in a copy;
 * when the border is not one flat colour the picture is refused ({ pic: null, flat: false }), so it is
 * never drawn as a rectangle. Returns { pic, cut, flat, removed (share of pixels keyed), ground }.
 */
export function keyBackground(pic, { tolerance = 0.14, flat = 0.8 } = {}) {
  const { width: w, height: h, data } = pic, N = w * h;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
  if (clear > 0.02 * N) return { pic, cut: true, flat: true, removed: 0, ground: null };
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const median = (c) => { const v = border.map((i) => data[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ground = [median(0), median(1), median(2)], tol = tolerance * 255 * Math.sqrt(3);
  const near = (i) => Math.hypot(data[i * 4] - ground[0], data[i * 4 + 1] - ground[1], data[i * 4 + 2] - ground[2]) <= tol;
  if (border.filter(near).length < flat * border.length) return { pic: null, cut: false, flat: false, removed: 0, ground };
  const seen = new Uint8Array(N), queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (const i of border) if (!seen[i] && near(i)) { seen[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < N && !seen[j] && near(j)) { seen[j] = 1; queue[tail++] = j; }
  }
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < N; i++) if (seen[i]) out[i * 4 + 3] = 0;
  return { pic: { width: w, height: h, data: out }, cut: false, flat: true, removed: tail / N, ground };
}

// a seeded pick of m pairs from a flat [x, y, x, y, …] list, in place; returns how many were kept
function pick(list, m, rnd) {
  const N = list.length / 2;
  if (N <= m) return N;
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rnd() * (N - i));
    const ax = list[i * 2], ay = list[i * 2 + 1];
    list[i * 2] = list[j * 2]; list[i * 2 + 1] = list[j * 2 + 1];
    list[j * 2] = ax; list[j * 2 + 1] = ay;
  }
  return m;
}

/**
 * A picture's colours mapped onto brand roles: { canvas, muted, ink, accent } as [r, g, b]. Each pixel's
 * brightness, stretched from the picture's own darkest `lo` to its lightest `hi` (0..1), places it on a
 * tone scale that runs from the canvas to the ink, with the ink end on the side away from the canvas
 * (on a light canvas dark pixels are ink, on a dark canvas light ones), so the picture keeps its light
 * and dark. A neutral pixel takes the ramp canvas → muted → ink; a vivid one takes canvas → accent →
 * ink, with the accent at its own place on the tone scale (kept between 0.2 and 0.8), so a colourful
 * picture keeps its tonal structure and runs through the accent instead of turning into one slab of
 * it; its lightest tone is a faint accent tint, never the canvas itself. Every result is a blend of two
 * roles; a one-tone picture (a mark) is ink.
 */
export function paletteRamp({ canvas, muted, ink, accent = null }, { lo = 0, hi = 1 } = {}) {
  const lc = lumOf(...canvas), li = lumOf(...ink), lightCanvas = lc > li;
  const span = hi - lo;
  const at = accent ? Math.min(0.8, Math.max(0.2, (lumOf(...accent) - lc) / ((li - lc) || 1))) : 0.5;
  return (r, g, b) => {
    const L = span < 0.04 ? (lightCanvas ? 0 : 1) : clamp01((lumOf(r, g, b) - lo) / span), w = lightCanvas ? 1 - L : L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (accent && mx >= 64 && (mx - mn) / mx >= 0.45) {
      const v = VIVID_FLOOR + (1 - VIVID_FLOOR) * w;   // a vivid pixel never fades all the way into the canvas
      return v < at ? mix(canvas, accent, v / at) : mix(accent, ink, (v - at) / (1 - at));
    }
    return w < 0.5 ? mix(canvas, muted, w * 2) : mix(muted, ink, w * 2 - 1);
  };
}


/**
 * A divergence-free swirl: the Arnold–Beltrami–Childress flow (each component a sum of a sine and a
 * cosine of the other two axes), its phases drifting with `t`. Every component's own derivative along
 * its axis is zero, so the flow neither gathers nor thins points: a closed-form stand-in for curl noise.
 * Writes the velocity (|v| < 3) into out[0..2] and returns out.
 */
export function flowOf(x, y, z, t, out) {
  const a = z + t, b = y - 0.7 * t, c = x + 0.5 * t;
  out[0] = Math.sin(a) + 0.6 * Math.cos(b);
  out[1] = 0.8 * Math.sin(c) + Math.cos(a);
  out[2] = 0.6 * Math.sin(b) + 0.8 * Math.cos(c);
  return out;
}

/**
 * The reveal's timeline, as shares of its progress: the burst runs from B0 to B1 (points spawn out of
 * the seed over SPAWN), the front sweeps from F0 to F1; from F1 on every point is home.
 */
export const FLIGHT = Object.freeze({ B0: 0.06, B1: 0.5, SPAWN: 0.08, F0: 0.3, F1: 0.94 });
const AXIS = (() => { const v = [0.22, 1, 0.12], l = Math.hypot(...v); return v.map((c) => c / l); })();
const easeOut = (x) => 1 - (1 - x) ** 3;

/**
 * Where one point is at progress q (0..1) of the reveal. Its home (hx, hy, hz), its burst direction (a
 * unit vector dx, dy, dz), its reach `s` (0..1, how far out in the cloud it flies) and its front jitter
 * `j` (0..1) are its own; `o` is the object's: { origin [x, y, z] (the seed), reach (the cloud's radius
 * at full burst, px), far (the farthest home from the origin, px), swirl (radians turned over the
 * reveal), size (the swirl's scale, px) }.
 * At q = 0 every point is at the origin. The burst carries it out along its direction, eased, turning
 * about a tilted axis (inner points faster) and carried by the swirl (a two-sample path on flowOf, so no
 * history is needed). A sphere grows from the origin; once it passes a point's home (nearer homes first,
 * ragged by `j`) the point flies home, eased out so it arrives at rest; from FLIGHT.F1 every point is
 * exactly home. Writes [x, y, z, landed 0..1, spawned 0..1] into out and returns it.
 */
export function flightOf(q, hx, hy, hz, dx, dy, dz, s, j, o, out) {
  const { B0, B1, SPAWN, F0, F1 } = FLIGHT;
  if (q >= F1) { out[0] = hx; out[1] = hy; out[2] = hz; out[3] = 1; out[4] = 1; return out; }
  const [ox, oy, oz] = o.origin;
  const spawn = smooth(B0, B0 + SPAWN, q);
  const b = easeOut(clamp01((q - B0) / (B1 - B0)));
  const r = o.reach * s * b * (1 + 0.12 * Math.max(0, q - B1));
  let cx = 0, cy = 0, cz = 0;
  if (r > 0) {
    // the burst direction, turned about the axis (Rodrigues), out to its radius
    const th = o.swirl * (0.7 * b + 0.3 * q) * (1.25 - 0.6 * s), co = Math.cos(th), si = Math.sin(th);
    const [ax, ay, az] = AXIS, dot = ax * dx + ay * dy + az * dz;
    cx = r * (dx * co + (ay * dz - az * dy) * si + ax * dot * (1 - co));
    cy = r * (dy * co + (az * dx - ax * dz) * si + ay * dot * (1 - co));
    cz = r * (dz * co + (ax * dy - ay * dx) * si + az * dot * (1 - co));
    // carried by the swirl: the flow at the point steps it to a midpoint, the flow there sets the offset
    const f = 1 / o.size, t = q * 1.6, v = [0, 0, 0];
    flowOf(cx * f, cy * f, cz * f, t, v);
    const mx = cx + v[0] * r * 0.12, my = cy + v[1] * r * 0.12, mz = cz + v[2] * r * 0.12;
    flowOf(mx * f, my * f, mz * f, t + 0.4, v);
    cx += v[0] * r * 0.18; cy += v[1] * r * 0.18; cz += v[2] * r * 0.18;
  }
  cx += ox; cy += oy; cz += oz;
  const W = 0.3 * o.far;
  const d = Math.max(0, Math.hypot(hx - ox, hy - oy, hz - oz) + (j - 0.5) * 0.2 * o.far);
  const front = (1.1 * o.far + W) * smooth(F0, F1, q);
  const land = clamp01((front - d) / W), e = easeOut(land);
  out[0] = cx + (hx - cx) * e; out[1] = cy + (hy - cy) * e; out[2] = cz + (hz - cz) * e;
  out[3] = land; out[4] = spawn;
  return out;
}

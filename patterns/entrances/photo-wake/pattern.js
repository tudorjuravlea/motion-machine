// entrances/photo-wake: the brand colour wakes a photo up. Before it starts, the picture is a two-colour
// print of its own light and shade in the brand's ink and canvas (each pixel on the segment between the
// two roles, shadows to the darker one), so even unmasked it is made of brand colours. Then an accent
// front travels across it from an origin, along an arrival field (distance from the origin warped by
// seeded value noise, equalised so the revealed area grows evenly), and the picture's real colours
// arrive behind the front. At p = 1 the canvas is gone and the slot is the plain picture. The canvas is
// declared media (data-media). Pure in p: the picture's pixels, its tones and the field are computed
// once per size and seed; a seek before the picture is decoded draws in ctx.afterSettle.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const FRONT = 0.9;   // the accent front's strength at its crest

const ORIGINS = {
  left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1], center: [0.5, 0.5],
  'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1],
};

/** The darker and the lighter of two role colours ([r, g, b]), by luminance. */
export function tones(ink, canvas) {
  return luma(...ink) <= luma(...canvas) ? { dark: ink, light: canvas } : { dark: canvas, light: ink };
}

/** The print's colour for a tone l in [0, 1]: the sRGB blend from the dark role to the light one. */
export function duotone(l, dark, light) {
  return [0, 1, 2].map((c) => Math.round(dark[c] + (light[c] - dark[c]) * l));
}

/**
 * At field value v and progress q (front width `band`): how much of the real picture shows (`reveal`)
 * and how strong the accent front is (`front`). The front's crest is where the level reaches v and its
 * glow reaches one band to either side; the colour has fully arrived one band behind the crest. Both are 0 everywhere at q = 0, and at q = 1 every
 * pixel is revealed with no front.
 */
export function frontAt(v, q, band) {
  const level = clamp(q, 0, 1) * (1 + 2 * band) - band, x = level - v;
  const reveal = smooth(0, band, x), f = 1 - Math.abs(x) / band;
  return { reveal: reveal || 0, front: f > 0 ? f * f : 0 };
}

/** Maps field values to their rank in [0, 1] (a 4096-bin histogram), so equal steps of level reveal equal areas. */
export function equalise(T) {
  let lo = Infinity, hi = -Infinity;
  for (const v of T) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const N = 4096, hist = new Float64Array(N), span = hi - lo || 1, bin = (v) => Math.min(N - 1, Math.floor(((v - lo) / span) * N));
  for (const v of T) hist[bin(v)]++;
  const cdf = new Float64Array(N);
  let run = 0;
  for (let i = 0; i < N; i++) { cdf[i] = (run + hist[i] / 2) / T.length; run += hist[i]; }
  const out = new Float32Array(T.length);
  for (let i = 0; i < T.length; i++) out[i] = cdf[bin(T[i])];
  return out;
}

// value noise on a lattice of n × n cells over the unit square, values drawn from rnd in row order
function lattice(n, rnd) { return { n, v: Float64Array.from({ length: (n + 1) * (n + 1) }, () => rnd()) }; }
function noiseAt(L, x, y) {
  const fx = x * L.n, fy = y * L.n, i = Math.min(L.n - 1, Math.floor(fx)), j = Math.min(L.n - 1, Math.floor(fy));
  const u = smooth(0, 1, fx - i), w = smooth(0, 1, fy - j), r = L.n + 1;
  const a = L.v[j * r + i], b = L.v[j * r + i + 1], c = L.v[(j + 1) * r + i], d = L.v[(j + 1) * r + i + 1];
  return (a + (b - a) * u) * (1 - w) + (c + (d - c) * u) * w;
}

/**
 * The arrival field on a w × h grid: distance from the origin (a share of the diagonal) plus `warp`
 * times two octaves of seeded value noise. o = { origin, warp, rnd }. Returns a Float32Array.
 */
export function field(w, h, { origin = 'left', warp = 0.35, rnd }) {
  const [ox, oy] = ORIGINS[origin] ?? ORIGINS.left, diag = Math.hypot(w, h);
  const n1 = lattice(3, rnd), n2 = lattice(6, rnd);
  const T = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5) / w, ny = (y + 0.5) / h;
    const n = 0.75 * noiseAt(n1, nx, ny) + 0.25 * noiseAt(n2, nx, ny);
    T[y * w + x] = Math.hypot((nx - ox) * w, (ny - oy) * h) / diag + warp * 0.5 * (n - 0.5);
  }
  return T;
}

// a CSS colour (a role variable's value) as [r, g, b], read back through a canvas's fill style
function rgbOf(doc, value) {
  const g = doc.createElement('canvas').getContext('2d');
  g.fillStyle = value;
  const s = String(g.fillStyle), m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
}

// picture url + size + params -> { ready, data: { px, tone, T } }; a few kept per page
const CACHE = new Map();
function prepare(img, w, h, key, fieldOf) {
  let e = CACHE.get(key);
  if (e) return e;
  e = { ready: false, data: null };
  const im = new Image();
  im.src = img.src;
  e.promise = im.decode().then(() => {
    // the picture as the frame shows it: object-fit cover, centred
    const c = img.ownerDocument.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, (w - im.naturalWidth * s) / 2, (h - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    const px = g.getImageData(0, 0, w, h).data, n = w * h;
    // tones: luminance stretched between its 1st and 99th percentiles
    const Y = new Float32Array(n), hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { Y[i] = luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); hist[Math.round(Y[i])]++; }
    const pct = (p) => { let run = 0; for (let v = 0; v < 256; v++) { run += hist[v]; if (run >= p * n) return v; } return 255; };
    const lo = pct(0.01), hi = pct(0.99), span = hi - lo >= 1 ? hi - lo : 255;
    const tone = new Float32Array(n);
    for (let i = 0; i < n; i++) tone[i] = clamp((Y[i] - (hi - lo >= 1 ? lo : 0)) / span, 0, 1);
    e.data = { px, tone, T: equalise(fieldOf(w, h)) };
  }, () => { e.data = null; }).finally(() => { e.ready = true; });
  CACHE.set(key, e);
  while (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  return e;
}

function paint(canvas, data, q, band, roles) {
  const { dark, light } = tones(roles.ink, roles.canvas), acc = roles.accent;
  const g = canvas.getContext('2d'), out = g.createImageData(canvas.width, canvas.height), o = out.data;
  const { px, tone, T } = data;
  for (let i = 0; i < T.length; i++) {
    const { reveal, front } = frontAt(T[i], q, band), l = tone[i], k = front * FRONT;
    for (let c = 0; c < 3; c++) {
      const d = Math.round(dark[c] + (light[c] - dark[c]) * l);
      const v = d + (px[i * 4 + c] - d) * reveal;
      o[i * 4 + c] = Math.round(v + (acc[c] - v) * k);
    }
    o[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
}

// the picture's own layout box (fractional px, untransformed), so the canvas covers it exactly
function boxOf(img) {
  const cs = getComputedStyle(img), w = parseFloat(cs.width) || img.offsetWidth, h = parseFloat(cs.height) || img.offsetHeight;
  return cs.position === 'absolute' ? { left: cs.left, top: cs.top, w, h } : { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, w, h };
}

// progress linear in time (the field is equalised, so a linear level reveals area evenly)
function linear(ctx, p) {
  if (p >= 1) return 1;
  if (ctx.u != null && ctx.d > 0) return clamp(ctx.u / ctx.d, 0, 1);
  return clamp(p, 0, 1);
}

export default {
  name: 'photo-wake',
  group: 'entrances',
  dur: 'hold',
  params: {
    origin: { type: 'enum(left|right|top|bottom|center|top-left|top-right|bottom-left|bottom-right)', default: 'left', meaning: 'where the colour starts' },
    band: { type: 'number', default: 0.12, meaning: 'width of the accent front as a share of the picture\'s reveal, 0.04 to 0.3' },
    warp: { type: 'number', default: 0.35, meaning: 'how much seeded noise bends the front, 0 (a clean arc) to 1' },
  },
  at(el, p, ctx) {
    const q = linear(ctx, p);
    if (q >= 1) return;   // at rest the slot is the plain picture
    const img = el.matches('img[data-media][src]') ? el : el.querySelector('img[data-media][src]');
    if (!img || !img.offsetWidth || !img.offsetHeight) return;
    const doc = el.ownerDocument, cs = getComputedStyle(el);
    const roles = Object.fromEntries(['ink', 'canvas', 'accent'].map((r) => [r, rgbOf(doc, cs.getPropertyValue(`--mm-color-${r}`).trim())]));
    const band = clamp(Number(ctx.params?.band ?? 0.12) || 0.12, 0.04, 0.3);
    const warp = clamp(Number(ctx.params?.warp ?? 0.35), 0, 1);
    const origin = ORIGINS[ctx.params?.origin] ? ctx.params.origin : 'left';
    const box = boxOf(img), w = Math.ceil(box.w), h = Math.ceil(box.h);
    const rnd = ctx.random, seed = [rnd(), rnd()].map((x) => x.toFixed(8)).join(':');
    const e = prepare(img, w, h, `${img.src}|${w}x${h}|${origin}|${warp}|${seed}`, (W, H) => field(W, H, { origin, warp, rnd: ctx.random }));
    if (e.ready && !e.data) return;
    const host = img.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const canvas = doc.createElement('canvas');
    canvas.className = 'mm-photo-wake';
    canvas.setAttribute('data-media', '');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = w; canvas.height = h;
    canvas.style.left = box.left; canvas.style.top = box.top;
    canvas.style.width = `${box.w}px`; canvas.style.height = `${box.h}px`;
    host.append(canvas);
    // the picture under the canvas would bleed through the antialiased edge of a rounded frame; the kit
    // restores the slot on every seek, so it is back at rest
    img.style.visibility = 'hidden';
    if (e.ready) paint(canvas, e.data, q, band, roles);
    else ctx.afterSettle(() => e.promise.then(() => { if (!e.data) { canvas.remove(); img.style.visibility = ''; } else if (canvas.isConnected) paint(canvas, e.data, q, band, roles); }));
  },
};

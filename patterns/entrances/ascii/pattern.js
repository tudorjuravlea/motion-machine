// entrances/ascii: a picture arrives as a field of glyphs and resolves into itself. The picture is read
// on a grid of square cells; each cell shows one glyph from a ramp, darkest to lightest, chosen by the
// picture's light there, in the brand's own face (its mono face when it has one) and one palette role
// over the canvas role. Cells come on in a seeded order, flicker through the ramp for a moment on a
// stepped clock, and settle on their glyph; then the glyph field fades as the real picture fades in, and
// at p = 1 the canvas is gone and the slot is the plain picture. An opt-in tech look: no preset uses it.
// The glyphs are drawn on a canvas declared media (data-media) and are not text the viewer reads
// (canvasText: G-LEGIBLE leaves them alone). Pure in the window's seconds: the picture's grid is read
// once per size, and a seek before the picture is decoded draws in ctx.afterSettle.
// The glyph-ramp ASCII look follows pmndrs/postprocessing's ASCII effect (Zlib); no code taken.
import { random, hash } from '../../../runtime/kit/random.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** The ramp, from the darkest cell to the lightest. */
export const RAMP = ' .:-=+*#%@';
const COME = 0.4, SETTLE = 0.12, RESOLVE = 0.62, STEPS_PER_S = 12;   // cells come on over the first 40 %; each flickers 12 % then settles; the picture resolves from 62 %

/** The glyph a cell shows: its own (by light) once settled, else one of the ramp on the stepped clock. */
export function glyphAt(light, q, on, step, seed) {
  const own = Math.round(clamp(light, 0, 1) * (RAMP.length - 1));
  if (q >= on + SETTLE) return RAMP[own];
  const k = Math.floor(random(seed ^ Math.imul(step + 1, 0x9e3779b1))() * RAMP.length);
  return RAMP[k];
}

const CACHE = new Map();
function prepare(img, cols, rows, key) {
  let e = CACHE.get(key);
  if (e) return e;
  e = { ready: false, light: null };
  const im = new Image();
  im.src = img.src;
  e.promise = im.decode().then(() => {
    const c = img.ownerDocument.createElement('canvas');
    c.width = cols; c.height = rows;
    const g = c.getContext('2d', { willReadFrequently: true });
    const s = Math.max(cols / im.naturalWidth, rows / im.naturalHeight);
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, (cols - im.naturalWidth * s) / 2, (rows - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
    const px = g.getImageData(0, 0, cols, rows).data;
    e.light = Float32Array.from({ length: cols * rows }, (_, i) => luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255);
  }, () => { e.light = null; }).finally(() => { e.ready = true; });
  CACHE.set(key, e);
  while (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  return e;
}

function paint(canvas, light, cols, rows, cell, q, t, seed, font, fg, bg, fade) {
  const g = canvas.getContext('2d');
  g.fillStyle = bg; g.globalAlpha = fade; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = fg; g.font = `${Math.round(cell * 1.05)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = Math.floor(t * STEPS_PER_S);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const n = j * cols + i, on = random(seed ^ Math.imul(n + 1, 0x85ebca6b))() * COME;
    if (q < on) continue;
    const ch = glyphAt(light[n], q, on, step, seed ^ Math.imul(n + 7, 0x27d4eb2f));
    if (ch !== ' ') g.fillText(ch, (i + 0.5) * cell, (j + 0.5) * cell);
  }
  g.globalAlpha = 1;
}

const params = {
  cell: { type: 'number', default: 0.018, meaning: 'the size of a glyph cell as a share of the frame\'s short side, 0.008 to 0.05' },
  role: { type: 'enum(accent|ink|muted|line)', default: 'accent', meaning: 'the palette role of the glyphs; they lie on the canvas role' },
};

export default {
  name: 'ascii',
  group: 'entrances',
  dur: 'hold',
  canvasText: true,
  params,
  at(el, p, ctx) {
    if (p >= 1) return;   // at rest the slot is the plain picture
    const q = ctx.u != null && ctx.d > 0 ? clamp(ctx.u / ctx.d, 0, 1) : clamp(p, 0, 1);
    const img = el.matches('img[data-media][src]') ? el : el.querySelector('img[data-media][src]');
    if (!img || !img.offsetWidth || !img.offsetHeight) return;
    const doc = el.ownerDocument, cs = getComputedStyle(el), stage = el.closest('.mm-stage');
    const short = Math.min(stage?.offsetWidth ?? 1080, stage?.offsetHeight ?? 1080);
    const cell = Math.max(6, Math.round(short * clamp(Number(ctx.params?.cell ?? 0.018) || 0.018, 0.008, 0.05)));
    const w = Math.ceil(img.offsetWidth), h = Math.ceil(img.offsetHeight), cols = Math.max(1, Math.round(w / cell)), rows = Math.max(1, Math.round(h / cell));
    const seed = hash(`${ctx.random()}`);
    const e = prepare(img, cols, rows, `${img.src}|${cols}x${rows}`);
    if (e.ready && !e.light) return;
    const role = ['accent', 'ink', 'muted', 'line'].includes(ctx.params?.role) ? ctx.params.role : 'accent';
    const fg = cs.getPropertyValue(`--mm-color-${role}`).trim(), bg = cs.getPropertyValue('--mm-color-canvas').trim();
    const font = cs.getPropertyValue('--mm-font-mono').trim() || cs.getPropertyValue('--mm-font-text').trim() || 'monospace';
    const resolve = clamp((q - RESOLVE) / (1 - RESOLVE), 0, 1), fade = 1 - resolve * resolve * (3 - 2 * resolve);
    const host = img.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const canvas = doc.createElement('canvas');
    canvas.className = 'mm-ascii';
    canvas.setAttribute('data-media', '');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = cols * cell; canvas.height = rows * cell;
    Object.assign(canvas.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${w}px`, height: `${h}px` });
    host.append(canvas);
    img.style.opacity = String(Math.round((1 - fade) * 1000) / 1000);   // the kit restores the slot on every seek
    const draw = () => paint(canvas, e.light, cols, rows, cell, q, Number(ctx.u) || 0, seed, font, fg, bg, fade);
    if (e.ready) draw();
    else ctx.afterSettle(() => e.promise.then(() => { if (!e.light) { canvas.remove(); img.style.opacity = ''; } else if (canvas.isConnected) draw(); }));
  },
};

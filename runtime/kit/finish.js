// finish.js: the brand finish's looks. Pure arithmetic plus one string builder, so the same style
// gives the same filter in every page. A look is a tone curve and a tint, defined from the palette
// roles and a curve, never a literal colour; the curve is a 33-sample table per channel that never
// lies more than LOOK_LIMIT from the identity, the same bound the layers that lie over text keep.
// `fxFilter` builds the one filter the stage wears for `chroma`, `bloom` and `look`, in that order:
// the lens first, then the glow of what the lens saw, then the grade. The glow is a screen, so
// whatever is already as light as the lightest role stays that light.
import { fringePrimitives } from './lens.js';

/** The named looks, in the order the schema lists them. */
export const LOOKS = ['neutral', 'warm-print', 'cool-print', 'faded', 'high-contrast'];
/** How far a look's table may lie from the identity, in 0..1: what a layer over text may weigh. */
export const LOOK_LIMIT = 0.08;
const SAMPLES = 33;
const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);
const r4 = (x) => String(Math.round(x * 1e4) / 1e4);

// A look's recipe: `contrast` bends the curve into an S (negative flattens it), `lift` raises the
// blacks and `pull` lowers the whites, and a tint pulls the shadows and the highlights toward a role
// that is warm or cool, each by a weight. The table is then scaled so the largest step off the
// identity is LOOK_LIMIT at most, whatever the palette's tint role is.
const RECIPES = {
  'warm-print': { contrast: 0.2, lift: 0.015, pull: 0.01, shadow: ['warm', 0.04], highlight: ['warm', 0.05] },
  'cool-print': { contrast: 0.2, lift: 0.01, pull: 0.005, shadow: ['cool', 0.05], highlight: ['cool', 0.02] },
  faded: { contrast: -0.2, lift: 0.06, pull: 0.02 },
  'high-contrast': { contrast: 0.5, lift: 0, pull: 0 },
};

const rgbOf = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// CIE L*a*b* (D65) chroma and hue of a hex colour: what tells a warm role from a cool one
function labOf(hex) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgbOf(hex).map(lin);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const a = 500 * (X - Y), c = 200 * (Y - Z);
  return { chroma: Math.hypot(a, c), hue: (Math.atan2(c, a) * 180) / Math.PI };
}
const WARM_HUE = 60, COOL_HUE = 255, TINT_ROLES = ['accent', 'line', 'muted', 'surface', 'canvas', 'ink'], MIN_CHROMA = 3, REACH = 45;   // the hues of a warm and a cool print (L*a*b* degrees), the roles a tint may come from, the least chroma a role must have, and how far (degrees) a role's hue may lie from the target

/**
 * The palette role a warm or a cool print tints with: the role of most chroma whose hue lies within
 * REACH of warm (an orange) or cool (a blue), so a brand whose accent is blue and whose canvas is cream
 * prints warm in its cream. `null` when no role lies that way: a look never borrows a colour from a
 * palette that has none of its kind, so a lime-on-black brand's warm print is its curve alone.
 */
export function tintRole(color, warmth) {
  const target = warmth === 'cool' ? COOL_HUE : WARM_HUE;
  let best = null, score = MIN_CHROMA;
  for (const role of TINT_ROLES) {
    if (!color[role]) continue;
    const { chroma, hue } = labOf(color[role]);
    const away = Math.abs(((hue - target + 540) % 360) - 180);
    if (away > REACH) continue;
    const s = chroma * Math.cos((away * Math.PI) / 180);
    if (s > score) { score = s; best = role; }
  }
  return best;
}

/**
 * A look as tone tables: { r, g, b }, each SAMPLES values in 0..1 for an input stepping 0..1, or null
 * for `neutral` and an unknown name. `amount` (0..1) scales the whole bend; 0 is the identity. The
 * tint roles come from `color` (hex by role name).
 */
export function lookTables(look, color, amount = 1) {
  const rc = RECIPES[look];
  if (!rc) return null;
  const k = clamp01(Number(amount));
  const tint = (spec) => { const role = spec && tintRole(color, spec[0]); return role ? { rgb: rgbOf(color[role]).map((c) => c / 255), w: spec[1] } : null; };
  const sh = tint(rc.shadow), hl = tint(rc.highlight);
  const raw = [0, 1, 2].map((ch) => Array.from({ length: SAMPLES }, (_, i) => {
    const v = i / (SAMPLES - 1);
    const s = v - (rc.contrast * Math.sin(2 * Math.PI * v)) / (2 * Math.PI);
    const f = rc.lift + (1 - rc.lift - rc.pull) * s;
    const ws = sh ? sh.w * (1 - v) ** 2 : 0, wh = hl ? hl.w * v ** 2 : 0;
    return f * (1 - ws - wh) + (sh ? sh.rgb[ch] * ws : 0) + (hl ? hl.rgb[ch] * wh : 0);
  }));
  let far = 0;
  for (const t of raw) t.forEach((y, i) => { far = Math.max(far, Math.abs(y - i / (SAMPLES - 1))); });
  const scale = far > LOOK_LIMIT ? LOOK_LIMIT / far : 1;
  const [r, g, b] = raw.map((t) => t.map((y, i) => { const v = i / (SAMPLES - 1); return clamp01(v + (y - v) * scale * k); }));
  return { r, g, b };
}

const tableAt = (table, c) => { const x = clamp01(c / 255) * (SAMPLES - 1), i = Math.min(SAMPLES - 2, Math.floor(x)); return 255 * (table[i] + (table[i + 1] - table[i]) * (x - i)); };
/**
 * The look as a function on an sRGB colour ([r, g, b], 0 to 255): what the stage's filter paints in place
 * of that colour. The identity when the finish has no look.
 */
export function gradeOf(finish, color) {
  const t = RECIPES[finish?.look] ? lookTables(finish.look, color, finish.lookAmount ?? 1) : null;
  if (!t) return (rgb) => rgb;
  return (rgb) => [tableAt(t.r, rgb[0]), tableAt(t.g, rgb[1]), tableAt(t.b, rgb[2])].map(Math.round);
}

/**
 * The look undone: for each channel a table of 256 entries that maps a painted value back to the value
 * the stage held before the look, or null when the finish has no look. G-BRAND reads a frame through it
 * (`ungradeImage`), so every blend of roles is judged where it was made, before the grade bent it.
 */
export function ungradeLuts(finish, color) {
  const t = RECIPES[finish?.look] ? lookTables(finish.look, color, finish.lookAmount ?? 1) : null;
  if (!t) return null;
  const lut = (table) => {
    const out = new Uint8Array(256);
    let x = 0;
    for (let v = 0; v < 256; v++) {
      while (x < 255 && Math.abs(tableAt(table, x + 1) - v) <= Math.abs(tableAt(table, x) - v)) x++;
      out[v] = x;
    }
    return out;
  };
  return [lut(t.r), lut(t.g), lut(t.b)];
}

/** A decoded image ({ width, height, data } of RGBA) read through `ungradeLuts`; the image itself when `luts` is null. */
export function ungradeImage(img, luts) {
  if (!luts || !img) return img;
  const data = new Uint8Array(img.data.length);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = luts[0][img.data[i]]; data[i + 1] = luts[1][img.data[i + 1]]; data[i + 2] = luts[2][img.data[i + 2]]; data[i + 3] = img.data[i + 3];
  }
  return { ...img, data };
}

const OVER_TEXT = ['grain', 'halftone', 'paper', 'scanlines'];
/**
 * The strengths of the finish layers that lie over text (grain, halftone, paper, scanlines), 0..1
 * each. They share the 0.08 that a layer over text may weigh: past a total of 1 each is scaled down in
 * proportion.
 */
export function overTextShares(finish = {}) {
  const v = Object.fromEntries(OVER_TEXT.map((k) => [k, Number(finish[k]) > 0 ? Math.min(1, Number(finish[k])) : 0]));
  const total = OVER_TEXT.reduce((a, k) => a + v[k], 0);
  if (total > 1) for (const k of OVER_TEXT) v[k] = Math.floor((v[k] / total) * 1e4) / 1e4;
  return v;
}

/** The grain's seed at piece time t: changes `rate` times a second (12 by default; 0 holds it still). */
export function grainSeed(t, rate = 12) {
  const n = Number(rate);
  return n > 0 ? 1 + (Math.floor(t * n + 1e-9) % 997) : 1;
}

/** The two palette roles a lens fringe is drawn in, [outer, inner]: `finish.chromaRoles`, else the accent outside and the muted role inside. */
export function chromaRoles(finish) {
  const ok = (r) => ['accent', 'ink', 'muted', 'surface', 'line', 'accentInk', 'canvas'].includes(r);
  const [a, b] = Array.isArray(finish?.chromaRoles) ? finish.chromaRoles : [];
  return [ok(a) ? a : 'accent', ok(b) ? b : 'muted'];
}
/** The gap between the two ghosts of a lens fringe at the frame's edge, in px of the page, at chroma strength `c` over a frame whose short side is `short` px. */
export function chromaShift(c, short) { return 0.004 * short * clamp01(Number(c) || 0); }
/** How much of the glow bloom adds, at bloom strength `b`: at most the 0.08 a layer over text may weigh. */
export function bloomGain(b) { return LOOK_LIMIT * clamp01(Number(b) || 0); }

/** Whether the finish asks for the stage filter: chroma, bloom, or a look other than neutral. */
export function needsFx(finish) {
  return Number(finish?.chroma) > 0 || Number(finish?.bloom) > 0 || (!!RECIPES[finish?.look] && finish?.lookAmount !== 0);
}

const BLOOM = { gain: 2.5, spread: 0.015 };   // the highlights' gain before the blur, and the blur as a share of the short side

/**
 * The `<filter id="mm-fx">` the stage wears (a string), or '' when the finish needs none. `color` is
 * the style's palette by role (hex), `spec` the format ({ w, h }) and `href` the ramp image's URL.
 * Chroma first, then bloom (the glow of whatever the lens drew lighter than the canvas, blurred and
 * added at most 0.08), then the look's tone tables.
 */
export function fxFilter(finish, color, spec, href) {
  if (!needsFx(finish)) return '';
  const short = Math.min(spec.w, spec.h);
  let body = '', prev = 'SourceGraphic';
  if (Number(finish.chroma) > 0) {
    const [outer, inner] = chromaRoles(finish);
    body += fringePrimitives({ id: 'mm-fx-c', input: prev, result: 'mm-fx-lens', a: chromaShift(finish.chroma, short), w: spec.w, h: spec.h, href, canvas: color.canvas, outer: color[outer], inner: color[inner] });
    prev = 'mm-fx-lens';
  }
  if (Number(finish.bloom) > 0) {
    const cv = rgbOf(color.canvas).map((c) => c / 255), g = bloomGain(finish.bloom);
    const lift = ['R', 'G', 'B'].map((ch, i) => `<feFunc${ch} type="linear" slope="${BLOOM.gain}" intercept="${r4(-BLOOM.gain * cv[i])}"/>`).join('');
    body += `<feComponentTransfer in="${prev}" result="mm-fx-hi">${lift}</feComponentTransfer>`
      + `<feGaussianBlur in="mm-fx-hi" stdDeviation="${r4(BLOOM.spread * short)}" result="mm-fx-halo"/>`
      + `<feComposite in="${prev}" in2="mm-fx-halo" operator="arithmetic" k1="${r4(-g)}" k2="1" k3="${r4(g)}" k4="0" result="mm-fx-bloom"/>`;   // a screen: in + g * halo * (1 - in)
    prev = 'mm-fx-bloom';
  }
  const tables = RECIPES[finish.look] ? lookTables(finish.look, color, finish.lookAmount ?? 1) : null;
  if (tables) {
    const fn = (ch, t) => `<feFunc${ch} type="table" tableValues="${t.map(r4).join(' ')}"/>`;
    body += `<feComponentTransfer in="${prev}">${fn('R', tables.r)}${fn('G', tables.g)}${fn('B', tables.b)}</feComponentTransfer>`;
  }
  return `<filter id="mm-fx" x="0" y="0" width="${spec.w}" height="${spec.h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${body}</filter>`;
}

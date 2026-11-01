// projection: the maths of an element that travels from one box to another without its insides
// stretching, for transitions/shared-element. Boxes in, numbers out; nothing here reads the page.
//
// An element is moved by a translate and a scale about its centre (an axis delta with an origin), its
// children are scaled back by the inverse so text and logos keep their shape, its corner radius and
// shadow are divided by the scale so they look the same size on the page, the two copies cross-fade
// in windows that never dip, and a pair whose proportions differ by more than 0.2 is cropped or moved
// without scaling. Travel can bow on an arc. Written for MM from the usual way layout animation is
// done (measure both boxes, animate the difference, correct what the scale distorts); the windows,
// the 0.2 aspect tolerance and the arc's proportions are plain numbers of that technique.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const fin = (x) => (Number.isFinite(x) ? x : NaN);

/** A pair whose aspect ratios differ by more than this is not stretched into the other box. */
export const ASPECT_TOLERANCE = 0.2;
/** The arc of travel: strength is the bow as a share of the distance (the apex is half of it), `min` px under which a hop does not arc. */
export const ARC = { strength: 0.5, peak: 0.5, min: 20 };

/**
 * One axis from box A to box B about an origin (0..1 of the length, 0.5 the middle):
 * { origin, scale, translate }. Scale is the ratio of lengths, translate moves the origin point of A onto
 * the same point of B. A scale within 1e-4 of 1 is 1, a translate within 0.01 px of 0 is 0, and a box with
 * no length gives scale 1: nothing here is ever NaN.
 */
export function axisDelta(src, tgt, origin = 0.5) {
  const ls = src.max - src.min, lt = tgt.max - tgt.min;
  let scale = fin(lt / ls), translate = fin(lerp(tgt.min, tgt.max, origin) - lerp(src.min, src.max, origin));
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-4) scale = 1;
  if (!Number.isFinite(translate) || Math.abs(translate) <= 0.01) translate = 0;
  return { origin, scale, translate };
}

/** Both axes from box A to box B ({ x, y, w, h } each), or null when either box has no size. */
export function boxDelta(a, b, origin = [0.5, 0.5]) {
  if (!(a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0)) return null;
  return {
    x: axisDelta({ min: a.x, max: a.x + a.w }, { min: b.x, max: b.x + b.w }, origin[0]),
    y: axisDelta({ min: a.y, max: a.y + a.h }, { min: b.y, max: b.y + b.h }, origin[1]),
  };
}

/** Progress p, held at 0 below a and at 1 above b, eased by e between. */
export function compress(a, b, e, p) { return p <= a ? 0 : p >= b ? 1 : e((p - a) / (b - a)); }
/** Circular ease-out. */
export const circOut = (t) => { t = clamp01(t); return Math.sqrt(1 - (t - 1) * (t - 1)); };

/**
 * The cross-fade of the two scenes: the incoming (lead) rises with a circular ease-out over the first half;
 * the outgoing (follow) falls linearly over 0.5 to 0.95. The incoming is whole before the outgoing starts to
 * go, so there is no dip in between.
 */
export function fadeWindows(p) {
  p = clamp01(p);
  return { lead: compress(0, 0.5, circOut, p), follow: 1 - compress(0.5, 0.95, (x) => x, p) };
}

/** Whether two boxes ({ w, h }) differ in aspect ratio by more than the tolerance. */
export function aspectOff(a, b) { return Math.abs(a.w / a.h - b.w / b.h) > ASPECT_TOLERANCE + 1e-9; }

/**
 * Where an element has got to on its way by d = { x, y } at q (0 to 1): the straight line, or a quadratic arc
 * whose control point is the line's midpoint pushed sideways by `strength` of the distance (the apex is half
 * that). The side is the same side of the screen whichever way it travels (horizontal travel bows up the
 * page, vertical bows to the right) unless `side` says `cw` or `ccw`. A hop under ARC.min px is straight.
 */
export function arcPoint(d, q, { strength = ARC.strength, side = 'auto' } = {}) {
  const dist = Math.hypot(d.x, d.y);
  if (!(strength > 0) || dist < ARC.min) return { x: d.x * q, y: d.y * q };
  const sgn = side === 'cw' ? -1 : side === 'ccw' ? 1 : Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? -1 : 1) : (d.y > 0 ? -1 : 1);
  const px = (-d.y / dist) * sgn * strength * dist, py = (d.x / dist) * sgn * strength * dist;
  const cx = d.x * ARC.peak + px, cy = d.y * ARC.peak + py;
  const u = 1 - q;
  return { x: 2 * u * q * cx + q * q * d.x, y: 2 * u * q * cy + q * q * d.y };
}

/** A corner radius of r px seen through a scale of (sx, sy): the radii to write ([horizontal, vertical]) so it still looks r on the page. */
export function cornerFix(r, sx, sy) { return [sx > 0 ? r / sx : r, sy > 0 ? r / sy : r]; }
/** The radius on the page between two boxes' radii at q, never negative. */
export function mixRadius(ra, rb, q) { return Math.max(0, lerp(ra, rb, q)); }

const fmt = (x) => `${Math.round(x * 1000) / 1000}px`;
/** Splits a CSS list at its top-level commas. */
function topLevel(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/**
 * A computed box-shadow seen through a scale of (sx, sy): offsets are divided by their axis's scale, blur and
 * spread by the mean of the two, so it looks the same size on the page. The colour is left as it is, every shadow of a
 * list is corrected, and `none` stays `none`. The result has the colour first, `inset` before it.
 */
export function shadowFix(css, sx, sy) {
  const text = String(css ?? '').trim();
  if (!text || text === 'none') return 'none';
  const mean = (sx + sy) / 2;
  return topLevel(text).map((one) => {
    const inset = /(^|\s)inset(\s|$)/.test(one);
    const colour = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\([^)]*(?:\([^)]*\)[^)]*)*\)/.exec(one)?.[0];
    const rest = colour ? one.replace(colour, ' ') : one;
    const nums = rest.replace(/\binset\b/, ' ').trim().split(/\s+/).filter((t) => /^-?[\d.]+(px)?$/.test(t)).map(parseFloat);
    const colourless = !colour ? rest.replace(/\binset\b/, ' ').trim().split(/\s+/).find((t) => !/^-?[\d.]+(px)?$/.test(t)) : null;
    const [ox = 0, oy = 0, blur = 0, spread = 0] = nums;
    const dx = sx > 0 ? ox / sx : ox, dy = sy > 0 ? oy / sy : oy, k = mean > 0 ? 1 / mean : 1;
    return `${inset ? 'inset ' : ''}${colour ?? colourless ?? ''} ${fmt(dx)} ${fmt(dy)} ${fmt(blur * k)} ${fmt(spread * k)}`.replace(/\s+/g, ' ').trim();
  }).join(', ');
}

/**
 * A copy of a box shown through a window that is a different shape: the content is scaled evenly to cover the window,
 * centred on it, and everything outside the window is cut. Returns { k, tx, ty, clip } with the translate from the box's
 * centre to the window's, the scale, and the insets (top, right, bottom, left, in the box's own pixels) of the cut.
 */
export function cropPlace(box, win) {
  const k = Math.max(win.w / box.w, win.h / box.h);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, wx = win.x + win.w / 2, wy = win.y + win.h / 2;
  const halfW = win.w / (2 * k), halfH = win.h / (2 * k);
  return {
    k, tx: wx - cx, ty: wy - cy,
    clip: { top: Math.max(0, box.h / 2 - halfH), right: Math.max(0, box.w / 2 - halfW), bottom: Math.max(0, box.h / 2 - halfH), left: Math.max(0, box.w / 2 - halfW) },
  };
}

/**
 * The journey of one shared element from its box in the outgoing scene (`ra`) to its box in the incoming (`rb`),
 * both { x, y, w, h } in page px measured with transforms cleared. `fit`: `width` scales both axes by the width
 * ratio (type keeps its shape), `stretch` fills the target box exactly, `box` fills it exactly unless the
 * proportions differ by more than 0.2, when `mismatch` decides: `crop` (a window changing shape over evenly
 * scaled content) or `position` (the copies move without scaling). Returns null for a box with no size, else
 * { kind, sx, sy, counter, dx, dy, at(q, { strength, side }) }; `counter` says the children are to be scaled back.
 * at(q) gives, for kind scale or position, both copies' { tx, ty, sx, sy } (the outgoing copy `a` runs from
 * (0,0) at scale 1, the incoming `b` ends there) and, for kind crop, the window { x, y, w, h } at q.
 */
export function journey(ra, rb, { fit = 'width', mismatch = 'crop' } = {}) {
  const d = boxDelta(ra, rb);
  if (!d) return null;
  const dx = d.x.translate, dy = d.y.translate;
  let kind = 'scale', sx = d.x.scale, sy = d.y.scale;
  if (fit === 'width') sy = sx;
  else if (fit === 'box' && aspectOff(ra, rb)) kind = mismatch === 'position' ? 'position' : 'crop';
  if (kind === 'position') { sx = 1; sy = 1; }
  const counter = kind === 'scale' && Math.abs(sx - sy) > 1e-3;
  const at = (q, arc) => {
    q = clamp01(q);
    const p = arc && arc.strength > 0 ? arcPoint({ x: dx, y: dy }, q, arc) : { x: dx * q, y: dy * q };
    if (kind === 'crop') {
      const cx = ra.x + ra.w / 2 + p.x, cy = ra.y + ra.h / 2 + p.y, w = lerp(ra.w, rb.w, q), h = lerp(ra.h, rb.h, q);
      return { win: { x: cx - w / 2, y: cy - h / 2, w, h } };
    }
    return {
      a: { tx: p.x, ty: p.y, sx: lerp(1, sx, q), sy: lerp(1, sy, q) },
      b: { tx: p.x - dx, ty: p.y - dy, sx: lerp(1 / sx, 1, q), sy: lerp(1 / sy, 1, q) },
    };
  };
  return { kind, sx, sy, counter, dx, dy, at };
}

// entrances/diagonal-join: a title is cut in two along a line at an angle through the middle of its
// text. The halves start apart, each slid along the cut (the half above toward the upper end of the
// cut, the half below toward the lower end), fade in and close until they meet as one title at
// p = 1, where the slot is exactly as laid out. Each half's slide is capped by the room its own ink
// has, so the type stays inside the safe area on every frame, and nothing is rotated. Writes a
// relative position on the slot and two spans inside it: the slot's own content (the half above)
// and an aria-hidden copy laid over it (the half below), each with a clip-path, a translate and an
// opacity.
import { inkOf, boxOf, safeArea } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

const params = {
  angle: { type: 'number', default: 30, meaning: 'the cut\'s rise in degrees from the horizontal, 0 to 75' },
  gap: { type: 'number', default: 1.2, meaning: 'how far each half starts from home along the cut, in multiples of ctx.unit, capped by the room' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const FADE = 0.35;

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * The two half-planes of a w × h box cut along a line through (cx, cy) (its centre by default)
 * rising at `angle` degrees, as polygons of [x, y] points: a above the cut, b below; each starts
 * with the same two points on the cut, then runs out to its own side, far past the box so no glyph
 * overhang is lost.
 */
export function halvesOf(w, h, angle, cx = w / 2, cy = h / 2) {
  const R = 2 * (w + h) + Math.abs(cx) + Math.abs(cy) + 1, c = Math.cos(rad(angle)), s = -Math.sin(rad(angle));
  const nx = -s, ny = c;   // the normal points below the cut
  const p0 = [cx - R * c, cy - R * s], p1 = [cx + R * c, cy + R * s];
  const out = (k) => [[p1[0] + k * R * nx, p1[1] + k * R * ny], [p0[0] + k * R * nx, p0[1] + k * R * ny]];
  return { a: [p0, p1, ...out(-1)], b: [p0, p1, ...out(1)] };
}

/** How far a half sits from home at p, as {x, y} px toward the cut's upper end; gap is its start distance. */
export function slideAt(p, gap, angle) {
  const k = 1 - smooth(clamp01(p));
  if (k <= 0) return { x: 0, y: 0 };
  return { x: k * gap * Math.cos(rad(angle)), y: -k * gap * Math.sin(rad(angle)) };
}

/**
 * The largest slide t along the cut that keeps the ink box inside the safe area: toward the cut's
 * upper end (sign 1), its lower end (-1) or either (0). Infinity with no layout.
 */
export function roomAlong(ink, area, angle, sign = 0) {
  if (!ink || !area) return Infinity;
  const dx = Math.cos(rad(angle)), dy = -Math.sin(rad(angle));
  let t = Infinity;
  const fit = (lo, hi, d) => {   // lo: room toward smaller coordinates, hi: toward larger
    for (const k of sign ? [sign] : [1, -1]) {
      const v = k * d;
      if (v > 1e-9) t = Math.min(t, Math.max(0, hi) / v);
      else if (v < -1e-9) t = Math.min(t, Math.max(0, lo) / -v);
    }
  };
  fit(ink.x0 - area.x0, area.x1 - ink.x1, dx);
  fit(ink.y0 - area.y0, area.y1 - ink.y1, dy);
  return t;
}

/**
 * The part of an ink box on one side of the cut through (cx, cy) at `angle` (side -1 above, 1
 * below), as its bounding box; null when nothing of the box is on that side.
 */
export function sideOf(ink, cx, cy, angle, side) {
  if (!ink) return null;
  const nx = Math.sin(rad(angle)), ny = Math.cos(rad(angle));   // the normal points below the cut
  const dist = ([x, y]) => side * ((x - cx) * nx + (y - cy) * ny);
  const pts = [[ink.x0, ink.y0], [ink.x1, ink.y0], [ink.x1, ink.y1], [ink.x0, ink.y1]], kept = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % 4], da = dist(a), db = dist(b);
    if (da >= 0) kept.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); kept.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  });
  if (kept.length < 3) return null;
  const xs = kept.map((k) => k[0]), ys = kept.map((k) => k[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const poly = (pts) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;

export default {
  name: 'diagonal-join',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const q = clamp01(p);
    if (q >= 1) return;   // joined: the slot is exactly as laid out
    if (!el.childNodes.length) return;
    const prm = { ...DEFAULTS, ...ctx.params };
    const angle = Math.min(75, Math.max(0, Number(prm.angle)));
    const want = Math.max(0, Number(prm.gap)) * (ctx.unit || 0) * (ctx.style?.motion?.travel ?? 1);
    const ink = inkOf(el), area = safeArea(el);
    const doc = el.ownerDocument;
    const a = doc.createElement('span');
    a.className = 'mm-diagonal-join__half';
    a.append(...el.childNodes);
    el.append(a);
    const b = a.cloneNode(true);
    b.setAttribute('aria-hidden', 'true');
    b.classList.add('mm-diagonal-join__copy');
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (cs?.position === 'static') el.style.position = 'relative';
    // the copy spans the content box exactly (insets, not a rounded width), so it wraps as the slot does
    if (cs) { b.style.left = cs.paddingLeft; b.style.right = cs.paddingRight; b.style.top = cs.paddingTop; }
    el.append(b);
    // the cut runs through the middle of the text's ink, in the half's own px
    const home = boxOf(a);
    const cx = ink && home ? (ink.x0 + ink.x1) / 2 - home.x0 : a.offsetWidth / 2;
    const cy = ink && home ? (ink.y0 + ink.y1) / 2 - home.y0 : a.offsetHeight / 2;
    const { a: pa, b: pb } = halvesOf(a.offsetWidth, a.offsetHeight, angle, cx, cy);
    const fx = home ? home.x0 + cx : 0, fy = home ? home.y0 + cy : 0;
    const gapA = Math.min(want, roomAlong(sideOf(ink, fx, fy, angle, -1), area, angle, 1));
    const gapB = Math.min(want, roomAlong(sideOf(ink, fx, fy, angle, 1), area, angle, -1));
    const o = smooth(clamp01(q / FADE));
    for (const [half, pts, gap, k] of [[a, pa, gapA, 1], [b, pb, gapB, -1]]) {
      const off = slideAt(q, Number.isFinite(gap) ? gap : want, angle);
      half.style.clipPath = poly(pts);
      half.style.translate = off.x === 0 && off.y === 0 ? 'none' : `${(k * off.x).toFixed(3)}px ${(k * off.y).toFixed(3)}px`;
      half.style.opacity = o >= 1 ? '' : o.toFixed(4);
    }
  },
};

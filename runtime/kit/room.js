// room.js: how far a pattern may scale or move an element before its text leaves the safe area or
// lands on a neighbour. Geometry is read from layout offsets, in frame pixels, so
// no transform (the element's own, a camera move's, a transition's) feeds back: the bound is the
// same at every instant and an entrance stays a pure function of p. Every function returns null
// when there is no laid-out DOM (a stub element in Node), and the caller then applies no bound.

const view = (el) => el?.ownerDocument?.defaultView ?? null;
const px = (el, name) => parseFloat(view(el).getComputedStyle(el.ownerDocument.documentElement).getPropertyValue(name)) || 0;

/** The element's layout box {x0, y0, x1, y1} in frame pixels (offsets up to the stage). */
export function boxOf(el) {
  if (!view(el) || !(el.offsetWidth > 0 || el.offsetHeight > 0)) return null;
  let x = 0, y = 0, n = el;
  while (n && !n.classList?.contains('mm-stage')) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x0: x, y0: y, x1: x + el.offsetWidth, y1: y + el.offsetHeight };
}

/** The extents of the element's text in frame pixels, untransformed; its box when it has no text. */
export function inkOf(el) {
  const box = boxOf(el);
  if (!box) return null;
  const doc = el.ownerDocument;
  const r = doc.createRange();
  r.selectNodeContents(el);
  const ink = r.getBoundingClientRect(), own = el.getBoundingClientRect();
  if (!ink.width || !own.width) return box;
  const k = own.width / el.offsetWidth;   // the ancestors' scale (a camera move, a cut)
  return { x0: box.x0 + (ink.left - own.left) / k, y0: box.y0 + (ink.top - own.top) / k, x1: box.x0 + (ink.right - own.left) / k, y1: box.y0 + (ink.bottom - own.top) / k };
}

/** The safe area {x0, y0, x1, y1}: the frame inset by --mm-safe. */
export function safeArea(el) {
  if (!view(el)) return null;
  const m = px(el, '--mm-safe');
  return { x0: m, y0: m, x1: px(el, '--mm-frame-w') - m, y1: px(el, '--mm-frame-h') - m };
}

/**
 * The pivot point in frame pixels for a transform-origin keyword pair the patterns write
 * ('left center', 'right center', 'center'), on the element's layout box.
 */
export function pivotOf(el, origin = 'center') {
  const b = boxOf(el);
  if (!b) return null;
  const [h] = String(origin).split(/\s+/);
  return { x: h === 'left' ? b.x0 : h === 'right' ? b.x1 : (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

/**
 * The largest scale (at least 1) about `origin` that keeps the element's text inside the safe area;
 * Infinity when nothing bounds it, null without a DOM.
 */
export function maxScale(el, origin = 'center') {
  const ink = inkOf(el), area = safeArea(el), o = pivotOf(el, origin);
  if (!ink || !area || !o) return null;
  let s = Infinity;
  for (const [e, c, lo, hi] of [[ink.x0, o.x, area.x0, area.x1], [ink.x1, o.x, area.x0, area.x1], [ink.y0, o.y, area.y0, area.y1], [ink.y1, o.y, area.y0, area.y1]]) {
    if (e > c + 1e-6) s = Math.min(s, (hi - c) / (e - c)); else if (e < c - 1e-6) s = Math.min(s, (c - lo) / (c - e));
  }
  return Math.max(1, s);
}

/**
 * Free room above the element, in px: down from the lowest thing above it in its scene (another
 * filled slot or a kept element that overlaps it horizontally), or from the safe margin. A fall
 * from above no longer than this never covers what sits over it. null without a DOM.
 */
export function roomAbove(el) {
  const me = boxOf(el), area = safeArea(el);
  if (!me || !area) return null;
  const scene = el.closest('.mm-camera') ?? el.parentElement;
  let ceiling = area.y0;
  for (const n of scene.querySelectorAll('[data-slot]:not([data-empty]), [data-keep]')) {
    if (n === el || n.contains(el) || el.contains(n)) continue;
    const b = boxOf(n);
    if (!b || b.y1 > me.y0 + 0.5 || b.x1 <= me.x0 || b.x0 >= me.x1) continue;
    ceiling = Math.max(ceiling, b.y1, inkOf(n).y1);   // a tight line-height lets glyphs hang below the box
  }
  return Math.max(0, me.y0 - ceiling);
}

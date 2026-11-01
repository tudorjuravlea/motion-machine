// dash: a stroke drawn on by a window of dash over a path of pathLength 1, so no length is measured
// and the pen runs at constant speed. The window is [a, b], shares of the path: a trail grows from
// the start, a comet is a segment of fixed length that enters, slides and leaves. An empty window is
// hidden outright: a zero-length dash with a round cap still paints a dot, and this keeps that dot
// off the first frame. Arrowheads sit on the window's ends and trim the line by half their size, so
// the stroke does not poke through the tip. Pure: closed forms of the progress they are given.
// Restated from the way these draw-ons are usually built (a dash window over a normalised path, a head
// trimmed by half its size); no source is reproduced.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** An empty window: shorter than this share of the path. */
const EMPTY = 1e-7;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * The window of the path that is drawn at progress q (0 to 1).
 * comet 0 (the default) is a trail from `from` to the pen; comet c (a share of the path) is a segment
 * that long, entering at `from` and leaving at `to`, the pen at its head, at the same speed as the trail's.
 * `from` and `to` bound the stretch of the path the draw-on covers.
 */
export function windowAt(q, { comet = 0, from = 0, to = 1 } = {}) {
  q = clamp01(q);
  const c = clamp01(comet);
  const span = to - from;
  if (!(c > 0)) return { a: from, b: from + span * q };
  const x = q * (1 + c);                  // the head's travel, in shares of the covered stretch
  const head = Math.min(x, 1), tail = Math.max(0, x - c);
  return { a: from + span * tail, b: from + span * head };
}

/**
 * The dash that draws a window on a path of pathLength 1: { hidden, array, offset }. One dash as long as
 * the window starting at a, then a gap longer than the path so it does not come round again.
 */
export function dashOf({ a, b }) {
  const len = b - a;
  if (!(len > EMPTY)) return { hidden: true, array: '0 2', offset: 0 };
  return { hidden: false, array: `${r6(len)} 2`, offset: r6(-a) || 0 };
}

/** Draws the window on an SVG shape node: pathLength 1, the dash, and the node hidden when the window is empty. */
export function setDash(node, win) {
  const d = dashOf(win);
  node.setAttribute('pathLength', '1');
  node.style.strokeDasharray = d.array;
  node.style.strokeDashoffset = String(d.offset);
  node.style.visibility = d.hidden ? 'hidden' : '';
  return d;
}

/**
 * Arrowheads on a window. `len` is the path's length in pixels, `size` the head's depth in pixels,
 * `head` is `end`, `start`, `both` or `none`. A head is never more than half the line drawn so far, and
 * the line stops half a head short of the tip it carries. Returns { window, size, heads: [{ at, t }] }
 * with `t` the share of the path the tip is at.
 */
export function headsOf(win, { len, size, head = 'none' }) {
  const visible = (win.b - win.a) * len;
  const ends = head === 'both' ? ['start', 'end'] : head === 'end' || head === 'start' ? [head] : [];
  if (!ends.length || !(visible > EMPTY * len)) return { window: { ...win }, size: 0, heads: [] };
  const s = Math.min(size, visible / (head === 'both' ? 4 : 2));
  const trim = s / 2 / len;
  const out = { a: win.a + (ends.includes('start') ? trim : 0), b: win.b - (ends.includes('end') ? trim : 0) };
  return { window: out, size: s, heads: ends.map((at) => ({ at, t: at === 'end' ? win.b : win.a })) };
}

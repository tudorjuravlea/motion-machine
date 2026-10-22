// emphasis/roulette: a highlight box runs along the options of a row or a list (the element's
// filled sibling slots, in document order) like a wheel of fortune: it starts on the first option,
// makes whole passes, slows down all the way and lands on the element itself, the answer, where it
// flashes and holds, then fades. The box hugs each option's text (a Range over it), no taller than
// a line, glides between neighbouring options and fades across the wrap from the last option back
// to the first. Phases run on the emphasis's own clock (the kit eases p for emphasis; the slowdown
// is this pattern's own curve).
//
// The answer's mark (accent text and an accent underline) is the slot's own CSS, keyed on its
// data-emphasis, so it holds through the rest of the scene. While the box is still running the
// pattern writes --mm-roulette-wait on the slot, which switches the mark off; from the landing it
// writes nothing of the kind, so the mark shows. Writes a box span inside the element, a relative
// position and isolation on it, and the wait flag before the landing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

const params = {
  passes: { type: 'number', default: 1, meaning: 'whole runs along the row before the run that lands, 0 to 4' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/** The share of the emphasis the run takes; from here the box sits on the answer. */
export const LAND = 0.62;
const IN = 0.05, FLASH = 0.12, OUT = 0.9;

/**
 * The box's position as a continuous option index at q (0 to 1 on the emphasis's own clock): it
 * runs passes · n + target options with a cubic slowdown, so its speed only falls, and from LAND on
 * sits on the target. `unwrap` gives the distance run instead of the position on the row.
 */
export function indexAt(q, n, target, passes, { unwrap = false } = {}) {
  const total = passes * n + target;
  const x = clamp01(q / LAND);
  const s = x >= 1 ? total : total * (1 - (1 - x) ** 3);
  if (unwrap) return s;
  const r = s - n * Math.floor(s / n);
  return r >= n - 1e-12 ? 0 : r;
}

/**
 * The box around a run of text: `rects` are its client rects (page px), `own` the box element's
 * client rect, `k` the scale the page draws it at; `pad` pads the sides (layout px), `line` is the
 * line pitch and `bx`, `by` the element's border widths. One line: the text's width plus the pads,
 * padded up and down but never taller than a line, centred on the text. Several lines: their union.
 * Null with no text.
 */
export function hugOf(rects, own, k, { pad = 0, line = Infinity, bx = 0, by = 0 } = {}) {
  const rs = [...rects].filter((r) => r.width > 0 && r.height > 0);
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.left)), x1 = Math.max(...rs.map((r) => r.left + r.width));
  const y0 = Math.min(...rs.map((r) => r.top)), y1 = Math.max(...rs.map((r) => r.top + r.height));
  const x = (x0 - own.left) / k - bx, y = (y0 - own.top) / k - by, w = (x1 - x0) / k, h = (y1 - y0) / k;
  if (h > 1.5 * line) return { x: x - pad, y, w: w + 2 * pad, h };
  const hh = Math.min(h + 1.2 * pad, line);
  return { x: x - pad, y: y + h / 2 - hh / 2, w: w + 2 * pad, h: hh };
}

// the box's frame in the element's padding box: the option's text, hugged
function frameOf(cell, el, pad, line) {
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(cell);
  const own = el.getBoundingClientRect();
  return hugOf(r.getClientRects(), own, own.width / el.offsetWidth || 1, { pad, line, bx: el.clientLeft || 0, by: el.clientTop || 0 })
    ?? { x: cell.offsetLeft - el.offsetLeft, y: cell.offsetTop - el.offsetTop, w: cell.offsetWidth, h: Math.min(cell.offsetHeight, line) };
}

export default {
  name: 'roulette',
  group: 'emphasis',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q < LAND) el.style.setProperty('--mm-roulette-wait', '1');   // the answer's mark waits for the landing
    if (q <= 0 || q >= 1) return;
    const cells = [...(el.parentElement?.querySelectorAll(':scope > [data-slot]:not([data-empty])') ?? [])];
    const target = cells.indexOf(el);
    if (target < 0 || !el.offsetWidth) return;
    const n = cells.length;
    const passes = Math.min(4, Math.max(0, Math.round(Number({ ...DEFAULTS, ...ctx.params }.passes))));
    const s = indexAt(q, n, target, passes);
    const i = Math.floor(s), f = s - i, j = (i + 1) % n;
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.fontSize) * 0.3 || 0;
    const line = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.2) || Infinity;
    const a = frameOf(cells[i], el, pad, line);
    let frame = a, wrap = 1;
    if (f > 0 && j !== 0) {
      const b = frameOf(cells[j], el, pad, line);
      frame = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f };
    } else if (f > 0) {   // the wrap: fade out on the last option, in on the first
      wrap = Math.abs(1 - 2 * f);
      if (f >= 0.5) frame = frameOf(cells[0], el, pad, line);
    }
    const fade = smooth(clamp01(q / IN)) * (1 - smooth(clamp01((q - OUT) / (1 - OUT))));
    const flash = q >= LAND ? Math.sin(Math.PI * clamp01((q - LAND) / FLASH)) : 0;
    const box = el.ownerDocument.createElement('span');
    box.className = 'mm-roulette';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `left:${frame.x.toFixed(2)}px;top:${frame.y.toFixed(2)}px;width:${frame.w.toFixed(2)}px;height:${frame.h.toFixed(2)}px;opacity:${(fade * wrap).toFixed(4)}`;
    box.style.setProperty('--mm-roulette-flash', flash.toFixed(4));
    if (cs.position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';   // the box sits behind the words but over the scene
    el.prepend(box);
  },
};

// exits/knife-cut: a blade slices across each line of the element's text, through the middle of
// its lowercase letters, then the element folds shut onto the middle of the block and the cuts go
// with it, so the last instant of the exit leaves nothing. The cut is a slit of the ground role
// that parts the letters (its thickness a share of the type size, so it reads next to display type),
// led by a short edge in the blade's role. The blades grow at an even speed from the reading side;
// the fold closes on the exit ease the kit applies. Writes scale and transform-origin on the element,
// a relative position on it and one slit span (holding its edge) per line inside it; the kit hides
// the element when the exit completes.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);

const params = {
  rule: { type: 'enum(ink|accent)', default: 'ink', meaning: 'the colour role of the blade\'s leading edge; accent when the cut is the story' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/** The share of the exit the rule takes to cross; the fold takes the rest. */
export const CUT = 0.35;
const GONE = 0.6;   // share of the fold after which the rule fades out with it

/**
 * The exit's state at q: how far the rule has crossed (0 to 1), the element's vertical scale
 * (1 open to 0 shut) and the rule's opacity.
 */
export function phasesAt(q) {
  const x = clamp01(q);
  if (x <= 0) return { rule: 0, fold: 1, alpha: 0 };
  if (x < CUT) return { rule: x / CUT, fold: 1, alpha: 1 };
  if (x >= 1) return { rule: 1, fold: 0, alpha: 0 };
  const f = (x - CUT) / (1 - CUT);
  return { rule: 1, fold: 1 - smooth(f), alpha: 1 - smooth(clamp01((f - GONE) / (1 - GONE))) };
}

const SLIT = 0.07;   // the slit's thickness, as a share of the font size
const EDGE = 0.45;   // the leading edge's length, as a share of the font size
const XMID = 0.56;   // where the middle of the lowercase letters sits in a line's text box, from its top

/**
 * The lines of text from its client rects (in page px) relative to the element's own box at `own`,
 * drawn at scale k by its ancestors: each line's horizontal extent and its cut height, in the
 * element's px, and the middle of the whole block (null with no text).
 */
export function linesOf(rects, own, k = 1) {
  const runs = [...rects].filter((r) => r.width > 0).map((r) => ({ x0: (r.left - own.left) / k, x1: (r.right - own.left) / k, y0: (r.top - own.top) / k, y1: (r.bottom - own.top) / k }));
  runs.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines = [];
  for (const r of runs) {
    const last = lines[lines.length - 1], c = (r.y0 + r.y1) / 2;
    if (last && c > last.y0 && c < last.y1) Object.assign(last, { x0: Math.min(last.x0, r.x0), x1: Math.max(last.x1, r.x1), y0: Math.min(last.y0, r.y0), y1: Math.max(last.y1, r.y1) });
    else lines.push({ ...r });
  }
  if (!lines.length) return { lines: [], mid: null };
  return { lines: lines.map((l) => ({ x0: l.x0, x1: l.x1, y: l.y0 + XMID * (l.y1 - l.y0) })), mid: (lines[0].y0 + lines[lines.length - 1].y1) / 2 };
}

export default {
  name: 'knife-cut',
  group: 'exits',
  params,
  at(el, p, ctx) {
    const s = phasesAt(p);
    if (s.rule <= 0) return;
    const prm = { ...DEFAULTS, ...ctx.params };
    const doc = el.ownerDocument;
    let found = { lines: [], mid: null };
    if (el.offsetWidth && typeof doc.createRange === 'function') {
      const r = doc.createRange();
      r.selectNodeContents(el);
      const own = el.getBoundingClientRect();
      found = linesOf(r.getClientRects(), own, own.width / el.offsetWidth || 1);
    }
    const mid = found.mid ?? (el.offsetHeight || 0) / 2;
    el.style.transformOrigin = `center ${mid.toFixed(2)}px`;
    el.style.scale = s.fold >= 1 ? '' : `1 ${s.fold.toFixed(5)}`;
    if (s.alpha <= 0 || !found.lines.length) return;
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const bx = el.clientLeft || 0, by = el.clientTop || 0;   // the slits sit in the padding box
    const font = (typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(el).fontSize) : 0) || el.offsetHeight || 0;
    const thick = Math.max(2, font * SLIT);
    for (const line of found.lines) {
      const w = (line.x1 - line.x0) * s.rule;
      const rule = doc.createElement('span');
      rule.className = `mm-knife-cut mm-knife-cut--${prm.rule === 'accent' ? 'accent' : 'ink'}`;
      rule.setAttribute('aria-hidden', 'true');
      rule.style.cssText = `left:${(line.x0 - bx).toFixed(2)}px;top:${(line.y - by).toFixed(2)}px;width:${w.toFixed(2)}px;height:${thick.toFixed(2)}px;opacity:${s.alpha.toFixed(4)}`;
      // each slit keeps its thickness while the element folds under it
      rule.style.scale = s.fold >= 1 ? '' : `1 ${(1 / Math.max(s.fold, 0.02)).toFixed(4)}`;
      const edge = doc.createElement('span');
      edge.className = 'mm-knife-cut__tip';
      edge.style.width = `${Math.min(w, font * EDGE).toFixed(2)}px`;
      rule.append(edge);
      el.append(rule);
    }
  },
};

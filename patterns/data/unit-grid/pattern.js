// data/unit-grid: "N of M" as countable units. waffle (a 10x10 grid whose N cells light in reading
// order, or by distance from a corner), isotype (N of M simple person glyphs, drawn in SVG from a
// circle and a rounded rectangle, no icon font) and pictobar (a column of unit bars that fills from
// the bottom). The value is N, `of` is M (a waffle always has 100 cells, so N is a share of `of`).
// A unit lights by its own short pop at its rank in the order, spread over the entrance; a value
// that is not whole ends on a part unit, filled to the fraction. The figure shown is the units
// landed times what a unit stands for (never past the value), so it reaches the fact's value as the
// last unit lands. Linear time is the entrance's own seconds (ctx.u over ctx.d); a deck rest is p = 1.
import { count } from '../../../runtime/kit/count.js';

const VARIANTS = ['waffle', 'isotype', 'pictobar'];
const ORDERS = ['reading', 'distance'];
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const TONES = ['accent', 'ink', 'muted'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const START = 0.06, SPREAD = 0.78, POP = 0.16;   // shares of the entrance: first unit, last start, one unit's pop

const PARAMS = {
  variant: { type: 'enum(waffle|isotype|pictobar)', default: 'waffle', meaning: 'waffle (10x10 cells), isotype (person glyphs) or pictobar (a column of unit bars filling from the bottom)' },
  of: { type: 'number', default: 0, meaning: 'M, what the whole is: a waffle\'s 100 cells stand for it, isotype and pictobar draw this many units (2 to 20); 0 takes 100, 10 and 10' },
  order: { type: 'enum(reading|distance)', default: 'reading', meaning: 'waffle: reading lights cells left to right, top to bottom; distance lights outward from `corner`' },
  corner: { type: 'enum(tl|tr|bl|br)', default: 'tl', meaning: 'waffle with order distance: the corner the lighting starts from' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of a lit unit' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the figure' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the figure; the grid scales with it' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/** The lighting rank (0 first) of every cell of a rows x cols grid, in cell index order (row by row). */
export function ranks(rows, cols, { order = 'reading', corner = 'tl' } = {}) {
  const idx = Array.from({ length: rows * cols }, (_, i) => i);
  if (order === 'distance') {
    const d = (i) => {
      const r = Math.floor(i / cols), c = i % cols;
      return Math.hypot(corner[0] === 'b' ? rows - 1 - r : r, corner[1] === 'r' ? cols - 1 - c : c);
    };
    idx.sort((a, b) => d(a) - d(b) || a - b);
  }
  const out = new Array(idx.length);
  idx.forEach((cell, rank) => { out[cell] = rank; });
  return out;
}

/** The pop (0 to 1) of the unit at `rank` among `lit` units (the last may be a part unit) at linear time q. */
export function pop(rank, lit, q) {
  const s = START + (SPREAD * rank) / Math.max(1, lit);
  return clamp01((q - s) / POP);
}

/** The figure at linear time q: the whole units landed times what a unit stands for, never past the value. */
export function shown(value, per, lit, q) {
  let landed = 0;
  for (let k = 0; k < lit; k++) if (pop(k, lit, q) >= 1) landed++;
  return q >= 1 ? value : Math.min(value, landed * per);
}

const PERSON = '<svg viewBox="0 0 24 44" aria-hidden="true"><circle cx="12" cy="7" r="6"/><rect x="3" y="16" width="18" height="28" rx="9"/></svg>';

export default {
  name: 'unit-grid',
  group: 'data',
  dur: 2,   // seconds: a hundred units need time to read as counted, whatever the style's roles; a beat's dur wins
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const variant = VARIANTS.includes(prm.variant) ? prm.variant : 'waffle';
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';
    const tone = TONES.includes(prm.tone) ? prm.tone : 'accent';
    const value = Math.max(0, num(el.dataset.value, 0));
    const q = p >= 1 ? 1 : ctx?.u != null && ctx?.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);

    // the whole (M) and the cells that stand for it
    const of = num(prm.of, 0);
    const M = variant === 'waffle' ? 100 : Math.min(20, Math.max(2, Math.round(of > 0 ? of : 10)));
    const whole = variant === 'waffle' ? (of > 0 ? of : 100) : M;
    const share = clamp01(value / whole);
    const L = share * M;                                   // units lit, possibly fractional
    const lit = Math.ceil(L - 1e-9);
    const per = whole / M;                                 // what one unit stands for, in the value's own units
    const cols = variant === 'waffle' ? 10 : variant === 'isotype' ? (M > 10 ? 10 : Math.min(M, 5)) : 1;
    const rows = Math.ceil(M / cols);
    const rank = variant === 'pictobar'
      ? Array.from({ length: M }, (_, i) => M - 1 - i)     // top to bottom in the DOM, so the bottom unit is first
      : ranks(rows, cols, { order: variant === 'waffle' ? prm.order : 'reading', corner: CORNERS.includes(prm.corner) ? prm.corner : 'tl' });

    el.classList.add('mm-ug');
    el.dataset.variant = variant;
    el.dataset.tone = tone;
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();

    const grid = doc.createElement('div');
    grid.className = 'mm-ug__grid';
    grid.setAttribute('aria-hidden', 'true');
    grid.style.setProperty('--mm-ug-cols', String(cols));
    grid.style.setProperty('--mm-ug-n', String(M));
    for (let i = 0; i < M; i++) {
      const u = doc.createElement('i');
      u.className = 'mm-ug__unit';
      const k = rank[i];
      const x = k < lit ? pop(k, lit, q) : 0;
      if (x > 0) {
        const part = k === lit - 1 ? L - (lit - 1) : 1;
        u.dataset.lit = '';
        u.style.setProperty('--mm-ug-x', x.toFixed(4));
        if (part < 1 - 1e-9) u.style.setProperty('--mm-ug-part', part.toFixed(4));
      }
      if (variant === 'isotype') u.innerHTML = PERSON + PERSON;
      grid.append(u);
    }
    const fig = doc.createElement('div');
    fig.className = 'mm-ug__figure';
    const v = shown(value, per, lit, q);
    count(fig, v, v, 1, { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' });
    el.append(variant === 'pictobar' ? grid : fig, variant === 'pictobar' ? fig : grid);
  },
};

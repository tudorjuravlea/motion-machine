// text/lit-sweep: a reading cursor travels the block and lights the words it passes. The block is
// split once into one inline span per word (the line breaks stay where the plain text puts them).
// Each word gets a place on the reading path: lines top to bottom, words in reading order, the
// running sum of the widths of the words before it plus half its own, over the sum of all widths.
// The cursor crosses the path from half a band before it to half a band past it on the entrance's
// easing; a word's light ramps from 0 to 1 across the band around the cursor and passes through the
// style's `move` easing. The unlit tone is a colour, ink mixed into the canvas at `floor` percent,
// so every word is readable from the first frame and nothing is ever transparent. With
// `edge: accent` the words inside the band lean toward the accent text colour, most at mid-band.
// At p = 1 nothing is written, so the rest is the plain text in the slot's own colour.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => String(Math.round(x * 100) / 100);

const params = {
  floor: { type: 'number', default: 30, meaning: 'how much ink an unlit word carries, in percent of full, 15 to 60' },
  soft: { type: 'number', default: 0.12, meaning: 'half the width of the light band, as a share of the reading path, 0.04 to 0.4' },
  edge: { type: 'enum(none|accent)', default: 'none', meaning: 'accent tints the words inside the light band toward the accent text colour' },
};

/** The bounded settings from a params bag. */
export function settingsOf(prm = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  return {
    floor: clamp(num(prm.floor, params.floor.default), 15, 60),
    soft: clamp(num(prm.soft, params.soft.default), 0.04, 0.4),
    edge: prm.edge === 'accent' ? 'accent' : 'none',
  };
}

/**
 * The place of each word on the reading path (0 to 1), from [{ line, w }] in reading order within
 * each line: lines are read in ascending order, and a word's place is the middle of its own width.
 */
export function placesOf(words) {
  const order = words.map((x, i) => i).sort((a, b) => words[a].line - words[b].line || a - b);
  const total = words.reduce((s, x) => s + Math.max(0, x.w), 0);
  const out = new Array(words.length).fill(0);
  if (!(total > 0)) { order.forEach((i, k) => { out[i] = (k + 0.5) / words.length; }); return out; }
  let run = 0;
  for (const i of order) {
    const w = Math.max(0, words[i].w);
    out[i] = (run + w / 2) / total;
    run += w;
  }
  return out;
}

/** The cursor's place at linear progress x, with a band of half-width h, on the easing `ease`. */
export function cursorAt(x, h, ease) {
  return -h + (1 + 2 * h) * ease(clamp01(x));
}

/** A word's light at place q with the cursor at c: a ramp across the band, through `ease`. */
export function lightAt(c, q, h, ease) {
  const L = clamp01(0.5 + (c - q) / (2 * h));
  return L <= 0 ? 0 : L >= 1 ? 1 : clamp01(ease(L));
}

/** The share of ink in percent for light L over a floor in percent. */
export const toneOf = (L, floor) => floor + (100 - floor) * L;
/** How far a word leans toward the accent: zero unlit and fully lit, one at mid-band. */
export const edgeOf = (L) => 4 * L * (1 - L);

// The block as word spans and the spaces between them, from its text.
function split(el) {
  const doc = el.ownerDocument;
  const text = el.textContent || '';
  el.textContent = '';
  const spans = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { el.append(doc.createTextNode(part)); continue; }
    const s = doc.createElement('span');
    s.className = 'mm-lit-sweep__w';
    s.textContent = part;
    el.append(s);
    spans.push(s);
  }
  return spans;
}

// Lines from the spans' tops: each distinct top, in order, is a line.
function linesOf(spans) {
  const tops = [...new Set(spans.map((s) => s.offsetTop))].sort((a, b) => a - b);
  return spans.map((s) => ({ line: tops.indexOf(s.offsetTop), w: s.offsetWidth }));
}

export default {
  name: 'lit-sweep',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx = {}) {
    if (p >= 1) return;   // the rest: the plain text, untouched
    const { floor, soft, edge } = settingsOf(ctx.params);
    const move = (x) => (ctx.ease ? ctx.ease('move', x) : x);
    const x = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const spans = split(el);
    if (!spans.length) return;
    const q = placesOf(linesOf(spans));
    const c = cursorAt(x, soft, (v) => v);   // a steady reading pace: the band's edges carry the easing
    spans.forEach((s, i) => {
      const L = lightAt(c, q[i], soft, move);
      const base = `color-mix(in srgb, var(--mm-color-ink) ${r2(toneOf(L, floor))}%, var(--mm-color-canvas))`;
      const e = edge === 'accent' ? edgeOf(L) : 0;
      s.style.color = e > 0.0005 ? `color-mix(in srgb, var(--mm-accent-text) ${r2(100 * e)}%, ${base})` : base;
    });
  },
};

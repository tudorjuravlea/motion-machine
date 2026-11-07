// entrances/light-reveal: a soft light front crosses the block at an angle; what it has passed is
// fully on and stays on, what it has not reached waits at a faint base strength, and a faint glint
// in the accent rides the front across the text. At p = 1 the whole block is on and nothing is
// written. The block never moves or scales. Writes a mask on the slot (sized past its box by a
// margin, so glyphs that overhang the box are lit with it) and, on a slot of bare text that paints
// no box of its own and keeps its ink inside its box, a gradient text fill for the glint.
import { inkOf, boxOf } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  angle: { type: 'number', default: 120, meaning: 'the direction the front travels, in CSS gradient degrees (90 is left to right, 180 top to bottom)' },
  soft: { type: 'number', default: 0.35, meaning: 'the width of the soft edge, as a share of the block, 0.05 to 0.8' },
  base: { type: 'number', default: 0.07, meaning: 'how strong the block is before the light reaches it, 0 to 0.3' },
  glint: { type: 'number', default: 0.4, meaning: 'how much accent the glint mixes into the text at its peak, 0 to 0.8; 0 for none' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/**
 * The front at p, in shares of the block along the travel: `lit` is where full strength ends and
 * `front` where the base strength begins, soft apart; at p = 0 the lit side is before the block,
 * at p = 1 the front is past it.
 */
export function frontAt(p, soft) {
  const q = clamp01(p);
  const lit = -soft + q * (1 + soft);
  return { lit, front: lit + soft };
}

/** The strength at a point x (share of the block along the travel) at p: base before the front, 1 behind it. */
export function strengthAt(x, p, soft, base) {
  if (p >= 1) return 1;
  const { lit, front } = frontAt(p, soft);
  if (x <= lit) return 1;
  if (x >= front) return base;
  return 1 - (1 - base) * ((x - lit) / soft);
}

// A slot that paints its own box keeps its background; the glint goes only on bare text.
const painted = (cs) => {
  const fill = cs.backgroundColor !== 'transparent' && !/,\s*0\)$/.test(cs.backgroundColor);
  return fill || cs.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
};

// A text fill paints only inside the box: ink past it would vanish, so such a slot gets no glint.
const overhangs = (el) => {
  const ink = inkOf(el), box = boxOf(el);
  return !!(ink && box) && (ink.x0 < box.x0 - 0.5 || ink.y0 < box.y0 - 0.5 || ink.x1 > box.x1 + 0.5 || ink.y1 > box.y1 + 0.5);
};

const pct = (v) => `${(v * 100).toFixed(3)}%`;
const MARGIN = 0.5;   // em the mask reaches past the box on every side

export default {
  name: 'light-reveal',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const q = clamp01(p);
    if (q >= 1) return;   // all on: the slot is exactly as laid out
    const prm = { ...DEFAULTS, ...ctx.params };
    const angle = Number(prm.angle) || 0;
    const soft = Math.min(0.8, Math.max(0.05, Number(prm.soft)));
    const base = Math.min(0.3, Math.max(0, Number(prm.base)));
    const glint = Math.min(0.8, Math.max(0, Number(prm.glint)));
    const { lit, front } = frontAt(q, soft);
    // the mask: full behind the lit edge, falling to the base strength at the front (alpha only)
    const on = 'var(--mm-color-ink)';
    const dim = `color-mix(in srgb, var(--mm-color-ink) ${(base * 100).toFixed(2)}%, transparent)`;
    el.style.maskImage = `linear-gradient(${angle}deg, ${on} ${pct(lit)}, ${dim} ${pct(front)})`;
    el.style.maskSize = `calc(100% + ${2 * MARGIN}em) calc(100% + ${2 * MARGIN}em)`;
    el.style.maskPosition = `-${MARGIN}em -${MARGIN}em`;
    el.style.maskRepeat = 'no-repeat';
    el.style.maskClip = 'no-clip';
    if (!(glint > 0) || el.children.length || typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(el);
    if (painted(cs) || overhangs(el)) return;
    // the glint: a narrow band of accent mixed into the glyphs, just behind the front
    const c = (lit + front) / 2, w = soft * 0.35;
    const peak = `color-mix(in srgb, var(--mm-accent-text) ${(glint * 100).toFixed(2)}%, ${cs.color})`;
    el.style.backgroundImage = `linear-gradient(${angle}deg, ${cs.color} ${pct(c - w)}, ${peak} ${pct(c)}, ${cs.color} ${pct(c + w)})`;
    el.style.backgroundClip = el.style.webkitBackgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
  },
};

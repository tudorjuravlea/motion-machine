// entrances/words: the text splits into words that rise and fade in turn. The kit does not do
// data-each, so the pattern stagger is its own: style.motion.stagger.eachS per word, the whole
// cascade capped by capS (and by 60 % of the entrance, so every word still has time to land).
// Each word eases on the type spring, which never overshoots. Writes translate and opacity on
// per-word spans it creates, and opacity on a slot that paints its own box (it fades with the first word); a seek restores the plain text, so nothing outlives the instant.
import { splitText, unitsOf, plainOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A slot that paints its own box (a fill or a border) fades with its first piece, so the box never
// shows empty while its text is still to come. A plain text slot is left alone.
const painted = (el) => {
  if (typeof getComputedStyle !== 'function') return false;
  const cs = getComputedStyle(el);
  const fill = cs.backgroundColor !== 'transparent' && !/,\s*0\)$/.test(cs.backgroundColor);
  return fill || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
};

const params = {
  d: { type: 'number', default: 28, meaning: 'rise per word in px before the style multiplier' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ROLE = 'slow';

function clock(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return { u: ctx.u, d: ctx.d };
  const d = ctx.style.motion.durations[ROLE] / 1000;
  return { u: clamp01(p) * d, d };
}

function shape(ctx, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sp = ctx.spring;
  return sp && sp.settle ? Math.min(1, sp(x * sp.settle('type'), 'type')) : x;
}

// a deck keeps the original text beside the units, for a screen reader
const split = (el, ctx) => (unitsOf(el) ?? splitText(el, { accessible: !!ctx.deck })).words;

export default {
  name: 'words',
  group: 'entrances',
  dur: ROLE,
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const { u, d } = clock(ctx, p);
    if (u >= d) { el.textContent = plainOf(el.textContent); return; }
    const spans = split(el, ctx);
    const n = spans.length;
    if (!n) return;
    const { eachS, capS } = ctx.style.motion.stagger;
    const span = Math.min(capS, d * 0.6, (n - 1) * eachS);
    const step = n > 1 ? span / (n - 1) : 0;
    const w = d - span;
    const rise = Number(prm.d) * ctx.style.motion.travel;
    spans.forEach((s, i) => {
      const k = shape(ctx, clamp01((u - i * step) / w));
      s.style.opacity = k >= 1 ? '' : String(clamp01(k));
      s.style.translate = k >= 1 ? 'none' : `0 ${((1 - k) * rise).toFixed(3)}px`;
    });
    if (painted(el)) { const k0 = shape(ctx, clamp01(u / w)); el.style.opacity = k0 >= 1 ? '' : String(clamp01(k0)); }
  },
};

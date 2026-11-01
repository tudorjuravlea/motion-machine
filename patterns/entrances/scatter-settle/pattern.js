// entrances/scatter-settle: the pieces of a line start at seeded random offsets and angles and
// settle into place together, each with its own small delay. The seed comes from the kit's
// random(), so the same slot scatters the same way on every load. Pieces are letters or words.
// Writes translate, rotate and opacity on spans it creates, and opacity on a slot that paints its
// own box (it fades in over the first quarter).
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
  d: { type: 'number', default: 90, meaning: 'scatter radius in px before the style multiplier' },
  turn: { type: 'number', default: 14, meaning: 'largest start angle in degrees, either way' },
  unit: { type: 'enum(char|word)', default: 'char', meaning: 'what scatters: letters or whole words' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ROLE = 'slow';
const LATE = 0.3;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

function shape(ctx, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sp = ctx.spring;
  return sp && sp.settle ? Math.min(1, sp(x * sp.settle('type'), 'type')) : x;
}

// a deck keeps the original text beside the pieces, for a screen reader
function split(el, unit, ctx) {
  const u = unitsOf(el) ?? splitText(el, { chars: unit !== 'word', accessible: !!ctx.deck });
  return unit === 'word' ? u.words : u.chars;
}

export default {
  name: 'scatter-settle',
  group: 'entrances',
  dur: ROLE,
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const lin = linear(ctx, p);
    if (lin >= 1) { el.textContent = plainOf(el.textContent); return; }
    const spans = split(el, prm.unit, ctx);
    const radius = Number(prm.d) * ctx.style.motion.travel;
    const turn = Number(prm.turn);
    const rnd = ctx.random;
    spans.forEach((s) => {
      // four draws per piece, always in the same order, so the scatter is one fixed layout
      const dx = (rnd() * 2 - 1) * radius, dy = (rnd() * 2 - 1) * radius, rot = (rnd() * 2 - 1) * turn, late = rnd() * LATE;
      const k = shape(ctx, clamp01((lin - late) / (1 - LATE)));
      s.style.opacity = k >= 1 ? '' : String(clamp01(k * 3));
      s.style.translate = k >= 1 ? 'none' : `${(dx * (1 - k)).toFixed(3)}px ${(dy * (1 - k)).toFixed(3)}px`;
      s.style.rotate = k >= 1 ? 'none' : `${(rot * (1 - k)).toFixed(3)}deg`;
    });
    if (painted(el)) el.style.opacity = String(clamp01(lin * 4));
  },
};

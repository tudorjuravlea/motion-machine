// entrances/line-reveal: a headline arrives line by line, word by word or letter by letter from
// behind a clip edge, following the real wrapping in the brand's face at the format being drawn.
// The kit's splitter reads the lines from the laid-out words, so a line break is wherever the
// text really breaks, and each unit sits in an overflow-clip box: it slides in from the clip edge
// with nothing showing before it (no fade needed). `mode: roll` gives every letter (or word) a twin
// and turns it over like a drum as it lands. The cascade is eachS per unit, capped by capS and by
// 60 % of the entrance (W-STAGGER); units ease on the type spring, which never overshoots.
// Writes translate and opacity on the units the splitter builds; at the end the plain text returns.
import { splitText, unitsOf, plainOf, rollOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A slot that paints its own box (a fill or a border) fades with its first unit, so the box never
// shows empty while its text is still to come. A plain text slot is left alone.
const painted = (el) => {
  if (typeof getComputedStyle !== 'function') return false;
  const cs = getComputedStyle(el);
  const fill = cs.backgroundColor !== 'transparent' && !/,\s*0\)$/.test(cs.backgroundColor);
  return fill || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
};

const params = {
  unit: { type: 'enum(line|word|char)', default: 'line', meaning: 'what arrives in turn: a line of the real wrapping, a word or a letter' },
  from: { type: 'enum(bottom|top|left|right)', default: 'bottom', meaning: 'the clip edge a unit slides in from' },
  mode: { type: 'enum(rise|roll)', default: 'rise', meaning: 'rise: the unit slides in from behind its clip edge; roll: the unit has a twin and turns over like a drum as it lands (words and letters)' },
  mask: { type: 'boolean', default: true, meaning: 'clip each unit at its box, so it appears from behind an edge; false lets it fade in instead' },
  travel: { type: 'number', default: 1, meaning: 'how far a unit starts from its place, in boxes of its own size' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ROLE = 'slow';
const KIND = { line: 'lines', word: 'words', char: 'chars' };
const SIDES = ['bottom', 'top', 'left', 'right'];

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

const flag = (v) => v === true || v === 'true' || v === 1 || v === '1';

// The units to move, split on the first draw of a seek and found again on the next draw of it.
function build(el, prm, ctx) {
  const unit = KIND[prm.unit] ? prm.unit : 'line';
  const from = SIDES.includes(prm.from) ? prm.from : 'bottom';
  const roll = prm.mode === 'roll' && unit !== 'line';
  const have = unitsOf(el);
  if (have) return { units: have[KIND[unit]], roll, from };
  const res = splitText(el, {
    lines: unit === 'line' ? 'wrap' : false,
    chars: unit === 'char',
    mask: flag(prm.mask) && !roll ? KIND[unit] : false,
    clone: roll ? from : false,
    accessible: !!ctx.deck,
  });
  return { units: res[KIND[unit]], roll, from };
}

export default {
  name: 'line-reveal',
  group: 'entrances',
  dur: ROLE,
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const { u, d } = clock(ctx, p);
    if (u >= d) { el.textContent = plainOf(el.textContent); return; }
    const { units, roll, from } = build(el, prm, ctx);
    const n = units.length;
    if (!n) return;
    const { eachS, capS } = ctx.style.motion.stagger;
    const span = Math.min(capS, d * 0.6, (n - 1) * eachS);
    const step = n > 1 ? span / (n - 1) : 0;
    const w = d - span;
    const clipped = flag(prm.mask) && !roll;
    const [axis, sign] = roll ? rollOf(from) : [from === 'left' || from === 'right' ? 'x' : 'y', from === 'bottom' || from === 'right' ? 1 : -1];
    const travel = Number(prm.travel);
    units.forEach((s, i) => {
      const k = shape(ctx, clamp01((u - i * step) / w));
      if (k >= 1) { s.style.translate = 'none'; s.style.opacity = ''; return; }
      // a clipped unit starts one box out, plus the clip's own padding; a roll turns over by one box
      const f = 1 - k;
      const off = roll
        ? `${(sign * 100 * k).toFixed(3)}%`
        : `calc(${(sign * 100 * travel * f).toFixed(3)}% + ${(sign * travel * f).toFixed(4)} * 2 * var(--mm-split-pad, 0em))`;
      s.style.translate = axis === 'y' ? `0 ${off}` : `${off} 0`;
      s.style.opacity = clipped ? '' : String(clamp01(roll ? k * 3 : k));
    });
    if (painted(el)) { const k0 = shape(ctx, clamp01(u / w)); el.style.opacity = k0 >= 1 ? '' : String(clamp01(k0)); }
  },
};

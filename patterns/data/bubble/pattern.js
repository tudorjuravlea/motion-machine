// data/bubble: one circle whose AREA is the value, beside a small reference circle whose area is a
// stated unit (`ref`, named by `refLabel`): "this is that, many times over". Radius goes with the
// square root of the value, so the picture is honest; the larger of the two takes the full size. The
// reference lands first, then the big circle grows with its area equal to the count shown (r from
// sqrt of the counted share), so the figure never passes the fact. A reference that would be smaller
// than a dot is drawn at the smallest size and mm.warnings says so; a value of zero or below draws
// no circle. Circles are SVG; the figure and the name are DOM text.
import { count } from '../../../runtime/kit/count.js';
import { selectorOf } from '../../../runtime/kit/schedule.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const TONES = ['accent', 'ink', 'muted'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const BIG = 28, SMALL = 19, MIN_R = 1.8;   // largest radius at the left, at the right (viewBox units, the box is 100 wide), smallest drawn

const PARAMS = {
  ref: { type: 'number', default: 1, meaning: 'the reference unit, in the value\'s own units: the small circle\'s area stands for it' },
  refLabel: { type: 'string', default: '', meaning: 'what the reference is, written under the small circle ("one pilot site")' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the big circle; the reference is the ink role' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the figure' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h1', meaning: 'the style size role of the figure' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/** The two radii (viewBox units) for a value and its reference: areas in the ratio of the numbers, the larger at full size. */
export function radii(value, ref) {
  const v = Math.max(0, value), r = Math.max(0, ref);
  const m = Math.max(v, r);
  if (!(m > 0)) return { big: 0, small: 0, clamped: false };
  let big = BIG * Math.sqrt(v / m), small = BIG * Math.sqrt(r / m);
  if (small > SMALL) { big *= SMALL / small; small = SMALL; }
  const clamped = (v > 0 && big < MIN_R) || (r > 0 && small < MIN_R);
  return { big: v > 0 ? Math.max(big, MIN_R) : 0, small: r > 0 ? Math.max(small, MIN_R) : 0, clamped };
}

export default {
  name: 'bubble',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const size = SIZES.includes(prm.size) ? prm.size : 'h1';
    const tone = TONES.includes(prm.tone) ? prm.tone : 'accent';
    const value = num(el.dataset.value, 0), ref = num(prm.ref, 1);
    const R = radii(value, ref);
    const q = clamp01(p);
    if (R.clamped) {
      const w = doc.defaultView?.mm?.warnings, msg = `${selectorOf(ctx?.scene, el.dataset.slot)}: data/bubble ${value} against a reference of ${ref} is too wide a ratio to draw to scale: the smaller circle is drawn at the smallest size, so its area is larger than the number says`;
      if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
    }
    const first = clamp01(q / 0.25), grow = clamp01((q - 0.2) / 0.8);   // the reference lands, then the big circle grows
    el.classList.add('mm-bubble');
    el.dataset.tone = tone;
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    const svg = `<svg viewBox="0 0 100 58" aria-hidden="true">`
      + (R.big > 0 ? `<circle class="mm-bubble__big" cx="30" cy="${(56 - R.big).toFixed(3)}" r="${(R.big * Math.sqrt(grow)).toFixed(3)}"/>` : '')
      + (R.small > 0 ? `<circle class="mm-bubble__ref" cx="80" cy="${(56 - R.small).toFixed(3)}" r="${(R.small * Math.sqrt(first)).toFixed(3)}"/>` : '')
      + `<line class="mm-bubble__base" x1="2" y1="57" x2="98" y2="57"/></svg>`;
    el.innerHTML = svg;
    const row = doc.createElement('div');
    row.className = 'mm-bubble__row';
    const fig = doc.createElement('div');
    fig.className = 'mm-bubble__figure';
    count(fig, 0, value, grow, { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' });
    const name = doc.createElement('div');
    name.className = 'mm-bubble__name';
    name.textContent = String(prm.refLabel ?? '');
    name.style.opacity = String(first);
    row.append(fig, name);
    el.append(row);
  },
};

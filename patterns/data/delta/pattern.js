// data/delta: a change as a chip: a caret that rises (or falls) into place, a sign and a counting
// value, and an optional name after it. The beat's `value` is the signed change; the caret follows
// its sign (`dir` overrides it) and the chip takes the accent when the change is the good direction
// (`good`), the line role when it is not, so a fall in costs can carry the accent. The value counts
// through the kit's count() on its magnitude, with the sign written beside it, and p is clamped, so
// the figure never passes the fact. The caret is SVG; the value and the name are DOM text.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const DIRS = ['auto', 'up', 'down'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const stage = (p, a, b) => clamp01((p - a) / (b - a));

const PARAMS = {
  dir: { type: 'enum(auto|up|down)', default: 'auto', meaning: 'the caret\'s direction; auto follows the value\'s sign' },
  good: { type: 'enum(up|down)', default: 'up', meaning: 'which direction is good news and carries the accent (down for costs, errors, time)' },
  label: { type: 'string', default: '', meaning: 'what the change is against, written after the chip ("vs last month")' },
  corner: { type: 'enum(pill|square)', default: 'pill', meaning: 'the chip\'s corners: pill (the largest radius) or square (the smallest)' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the value' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text between the sign and the number' },
  suffix: { type: 'string', default: '%', meaning: 'text after the number' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the chip' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/** Which way the change points and whether it is good news: { dir: 'up'|'down'|'flat', good: boolean }. */
export function judge(value, dir = 'auto', good = 'up') {
  const d = dir === 'up' || dir === 'down' ? dir : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return { dir: d, good: d !== 'flat' && d === good };
}

const CARET = { up: 'M6 2 L11 10 L1 10 Z', down: 'M6 10 L11 2 L1 2 Z', flat: 'M1 5 L11 5 L11 7 L1 7 Z' };

export default {
  name: 'delta',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';
    const value = num(el.dataset.value, 0);
    const j = judge(value, DIRS.includes(prm.dir) ? prm.dir : 'auto', prm.good === 'down' ? 'down' : 'up');
    const q = clamp01(p);
    const land = stage(q, 0, 0.45), tick = stage(q, 0.1, 1), name = stage(q, 0.55, 1);
    el.classList.add('mm-delta');
    el.dataset.dir = j.dir;
    el.dataset.good = String(j.good);
    el.dataset.corner = prm.corner === 'square' ? 'square' : 'pill';
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    const chip = doc.createElement('div');
    chip.className = 'mm-delta__chip';
    const caret = doc.createElement('span');
    caret.className = 'mm-delta__caret';
    caret.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${CARET[j.dir]}"/></svg>`;
    const rise = j.dir === 'down' ? -1 : 1;
    caret.style.transform = `translateY(${((1 - land) * 0.7 * rise).toFixed(4)}em)`;
    caret.style.opacity = String(clamp01(land * 3));
    const fig = doc.createElement('span');
    fig.className = 'mm-delta__value';
    if (value !== 0) fig.append(value < 0 ? '−' : '+');
    const digits = doc.createElement('span');
    count(digits, 0, Math.abs(value), tick, { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' });
    fig.append(digits);
    chip.append(caret, fig);
    el.append(chip);
    if (prm.label) {
      const l = doc.createElement('span');
      l.className = 'mm-delta__label';
      l.textContent = String(prm.label);
      l.style.opacity = String(name);
      el.append(l);
    }
  },
};

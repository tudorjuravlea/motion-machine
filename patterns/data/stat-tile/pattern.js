// stat-tile: a card with a figure, a label and a delta chip. The figure counts through the
// kit's count(); the label settles in after it and the delta last. The label is the `label`
// param, else the slot's own text. p is clamped at 1: the figure never passes the fact.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const stage = (p, a, b) => clamp01((p - a) / (b - a));

const PARAMS = {
  label: { type: 'string', default: '', meaning: 'what the figure measures; empty uses the slot text' },
  delta: { type: 'string', default: '', meaning: 'the change, written as given, such as "+12%"; empty omits the chip' },
  from: { type: 'number', default: 0, meaning: 'the figure counted up from' },
  fix: { type: 'number', default: 0, meaning: 'decimal places shown' },
  pad: { type: 'number', default: 0, meaning: 'minimum integer digits, zero-filled' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'display', meaning: 'the style size role of the figure' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'stat-tile',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    if (el.dataset.mmLabel === undefined) el.dataset.mmLabel = el.textContent.trim();
    const label = String(prm.label || el.dataset.mmLabel || '');
    const delta = String(prm.delta || '');
    const size = SIZES.includes(prm.size) ? prm.size : 'display';

    el.classList.add('mm-stat');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(p * 8));
    el.replaceChildren();
    const fig = doc.createElement('div');
    fig.className = 'mm-stat__figure';
    count(fig, num(prm.from, 0), num(el.dataset.value, 0), p, {
      pad: Math.max(0, Math.round(num(prm.pad, 0))),
      fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))),
      prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''),
    });
    el.append(fig);
    if (label) {
      const l = doc.createElement('div');
      l.className = 'mm-stat__label';
      l.textContent = label;
      l.style.opacity = String(stage(p, 0.2, 0.6));
      el.append(l);
    }
    if (delta) {
      const c = doc.createElement('div');
      c.className = `mm-stat__delta${/^[-−]/.test(delta) ? ' mm-stat__delta--down' : ''}`;
      c.textContent = delta;
      c.style.opacity = String(stage(p, 0.55, 0.95));
      el.append(c);
    }
  },
};

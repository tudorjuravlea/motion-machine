// bar-grow: up to six vertical bars that grow from the baseline in turn. Values come from the
// `values` param (or data-values), "40,70,55"; bar height is value / max (the largest value
// unless `max` is given). Arrivals are staggered by the style's stagger.eachS, capped by capS,
// and every bar is done at p = 1. A counting value rides each bar's top. Heights are percentages,
// so the bar tops keep their radius. p is clamped: no bar passes its fact.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const MAX_BARS = 6;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  values: { type: 'string', default: '', meaning: 'comma list of up to six numbers' },
  labels: { type: 'string', default: '', meaning: 'comma list of names under the bars' },
  max: { type: 'number', default: 0, meaning: 'the value that fills the chart; 0 uses the largest value' },
  focus: { type: 'number', default: 0, meaning: 'one-based bar drawn in the accent, the rest muted; 0 draws all in the accent' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the values' },
  prefix: { type: 'string', default: '', meaning: 'text before each value' },
  suffix: { type: 'string', default: '', meaning: 'text after each value' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'body', meaning: 'the style size role of the values' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'bar-grow',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const vals = String(prm.values || el.dataset.values || el.dataset.pValues || '')
      .split(',').map((s) => Number(s.trim())).filter(Number.isFinite).slice(0, MAX_BARS);
    const names = String(prm.labels || el.dataset.labels || el.dataset.pLabels || '').split(',').map((s) => s.trim());
    const n = vals.length;
    const max = num(prm.max, 0) > 0 ? num(prm.max, 0) : Math.max(...vals, 0) || 1;
    const size = SIZES.includes(prm.size) ? prm.size : 'body';
    const focus = Math.round(num(prm.focus, 0));
    const fix = Math.min(4, Math.max(0, Math.round(num(prm.fix, 0))));

    // Stagger in the progress domain: the last bar starts at span / d, and every bar ends at 1.
    const st = ctx.style.motion.stagger;   // the style schema requires motion.stagger; no fallback
    const d = (ctx && ctx.d) > 0 ? ctx.d : 1;
    const span = n > 1 ? Math.min(0.6, Math.min(st.eachS * (n - 1), st.capS) / d) : 0;
    const gap = n > 1 ? span / (n - 1) : 0;

    el.classList.add('mm-bars');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.replaceChildren();
    if (!n) return;
    const chart = doc.createElement('div');
    chart.className = 'mm-bars__chart';
    vals.forEach((v, i) => {
      const qi = clamp01((p - i * gap) / (1 - span));
      const h = clamp01(Math.max(v, 0) / max) * qi * 100;
      const col = doc.createElement('div');
      col.className = 'mm-bars__col';
      const well = doc.createElement('div');
      well.className = 'mm-bars__well';
      const bar = doc.createElement('div');
      bar.className = `mm-bars__bar${focus && focus !== i + 1 ? ' mm-bars__bar--quiet' : ''}`;
      bar.style.height = `${h.toFixed(3)}%`;
      const val = doc.createElement('div');
      val.className = 'mm-bars__value';
      val.style.bottom = `calc(${h.toFixed(3)}% + var(--mm-space-1))`;
      val.style.opacity = String(clamp01(qi * 6));
      count(val, 0, v, qi, { fix, prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') });
      well.append(bar, val);
      col.append(well);
      if (names[i]) {
        const lab = doc.createElement('div');
        lab.className = 'mm-bars__label';
        lab.textContent = names[i];
        col.append(lab);
      }
      chart.append(col);
    });
    el.append(chart);
  },
};

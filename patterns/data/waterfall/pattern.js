// data/waterfall: a start, up to five changes, and the total they leave. Each change is a floating
// bar that starts at the running total before it and grows to the one after; a thin link joins each
// bar to the next; the final total lands last, on the accent role (the tone), with a soft glow of
// that role. Values are a comma list: the first is the start, the rest are signed changes; the
// total is their sum (or the beat's own `value`, which a mismatch reports in mm.warnings). Every
// figure counts through the kit's count() as its bar lands and p is clamped, so no figure passes the
// fact. Names, figures and the baseline are DOM boxes (the gate reads them); the chart is percentages
// of the plot, so it holds at every format.
import { count, formatNumber } from '../../../runtime/kit/count.js';
import { selectorOf } from '../../../runtime/kit/schedule.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const TONES = ['accent', 'ink', 'muted'];
const MAX_VALUES = 6;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const START = 0.04, SPREAD = 0.7, GROW = 0.24;   // shares of the entrance: first bar, last start, one bar's growth

const PARAMS = {
  values: { type: 'string', default: '', meaning: 'comma list: the start, then up to four signed changes (five bars with the total at most six)' },
  labels: { type: 'string', default: '', meaning: 'comma list of names under the start and each change, one short word each' },
  total: { type: 'string', default: 'Total', meaning: 'the name under the final bar' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the final total' },
  glow: { type: 'boolean', default: true, meaning: 'a soft halo of the tone role around the final total once it lands' },
  weight: { type: 'number', default: 62, meaning: 'a bar\'s width as a percentage of its column' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the figures' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text before each figure' },
  suffix: { type: 'string', default: '', meaning: 'text after each figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'body', meaning: 'the style size role of the figures' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/**
 * The bars of a waterfall: the start from zero, each change from the running total before it to the one
 * after, then the total from zero. Each bar is { kind, from, to, delta } in the data's own units.
 */
export function bars(values) {
  const out = [];
  let run = 0;
  values.forEach((v, i) => {
    if (i === 0) { out.push({ kind: 'start', from: 0, to: v, delta: v }); run = v; } else { out.push({ kind: v >= 0 ? 'up' : 'down', from: run, to: run + v, delta: v }); run += v; }
  });
  out.push({ kind: 'total', from: 0, to: run, delta: run });
  return out;
}

/** The progress (0 to 1) of bar k of n at linear time q. */
export function landing(k, n, q) {
  return clamp01((q - (START + (SPREAD * k) / Math.max(1, n - 1))) / GROW);
}

export default {
  name: 'waterfall',
  group: 'data',
  dur: 2.2,   // seconds: bars land in turn, so the entrance is as long as the walk needs; a beat's dur wins
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const values = String(prm.values ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter(Number.isFinite).slice(0, MAX_VALUES - 1);
    const names = String(prm.labels ?? '').split(',').map((s) => s.trim());
    const size = SIZES.includes(prm.size) ? prm.size : 'body';
    const tone = TONES.includes(prm.tone) ? prm.tone : 'accent';
    const q = p >= 1 ? 1 : ctx?.u != null && ctx?.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const ease = (x) => (ctx?.ease ? ctx.ease('enter', x) : x);
    el.classList.add('mm-wf');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    if (values.length < 2) return;
    const list = bars(values);
    const n = list.length;
    const sum = list[n - 1].to;
    const given = el.dataset.value;
    if (given != null && given !== '' && Math.abs(num(given, sum) - sum) > 1e-9) {
      const w = doc.defaultView?.mm?.warnings, msg = `${selectorOf(ctx?.scene, el.dataset.slot)}: data/waterfall value ${given} is not the sum of its values (${formatNumber(sum, { fix: 4 }).replace(/\.?0+$/, '')}): the total bar shows the sum`;
      if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
    }
    const fmt = { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' };
    const lo = Math.min(0, ...list.map((b) => Math.min(b.from, b.to))), hi = Math.max(0, ...list.map((b) => Math.max(b.from, b.to)));
    const span = hi - lo || 1;
    const y = (v) => ((hi - v) / span) * 100;   // percent from the plot's top

    el.dataset.tone = tone;
    el.style.setProperty('--mm-wf-weight', `${Math.min(100, Math.max(20, num(prm.weight, 62)))}%`);
    const plot = doc.createElement('div');
    plot.className = 'mm-wf__plot';
    plot.setAttribute('aria-hidden', 'true');
    const zero = doc.createElement('i');
    zero.className = 'mm-wf__zero';
    zero.style.top = `${y(0).toFixed(3)}%`;
    plot.append(zero);
    const labels = doc.createElement('div');
    labels.className = 'mm-wf__names';
    list.forEach((b, k) => {
      const x = ease(landing(k, n, q));
      const col = doc.createElement('div');
      col.className = 'mm-wf__col';
      const top = Math.min(y(b.from), y(b.to)), bottom = Math.max(y(b.from), y(b.to));
      // the free edge travels from the running total before the bar to the one after it
      const free = y(b.from) + (y(b.to) - y(b.from)) * x;
      const t0 = Math.min(y(b.from), free), t1 = Math.max(y(b.from), free);
      if (x > 0) {
        const bar = doc.createElement('i');
        bar.className = `mm-wf__bar mm-wf__bar--${b.kind}`;
        bar.style.top = `${t0.toFixed(3)}%`;
        bar.style.height = `${Math.max(0, t1 - t0).toFixed(3)}%`;
        if (b.kind === 'total' && prm.glow !== false && prm.glow !== 'false') bar.style.setProperty('--mm-wf-glow', (x * x).toFixed(4));
        col.append(bar);
        const fig = doc.createElement('div');
        fig.className = `mm-wf__figure${b.delta < 0 && b.kind !== 'start' && b.kind !== 'total' ? ' mm-wf__figure--below' : ''}`;
        if (fig.className.includes('below')) fig.style.top = `calc(${bottom.toFixed(3)}% + var(--mm-space-1))`; else fig.style.bottom = `calc(${(100 - top).toFixed(3)}% + var(--mm-space-1))`;
        const signed = b.kind === 'up' || b.kind === 'down';
        if (signed) fig.append(b.delta < 0 ? '−' : '+');
        const val = doc.createElement('span');
        count(val, 0, signed || b.delta >= 0 ? Math.abs(b.delta) : b.delta, x, fmt);
        fig.append(val);
        fig.style.opacity = String(clamp01(x * 4));
        col.append(fig);
      }
      plot.append(col);
      const nm = doc.createElement('span');
      nm.className = `mm-wf__name${b.kind === 'total' ? ' mm-wf__name--total' : ''}`;
      nm.textContent = b.kind === 'total' ? String(prm.total ?? 'Total') : names[k] ?? '';
      nm.style.opacity = String(clamp01(x * 3));
      labels.append(nm);
    });
    // the links: a thin line from each bar's end to the next bar, once the first has landed
    for (let k = 0; k < n - 1; k++) {
      if (landing(k, n, q) < 1) continue;
      const link = doc.createElement('i');
      link.className = 'mm-wf__link';
      link.style.top = `${y(list[k].to).toFixed(3)}%`;
      link.style.left = `${(((k + 0.5) / n) * 100).toFixed(3)}%`;
      link.style.width = `${(100 / n).toFixed(3)}%`;
      link.style.opacity = String(clamp01(landing(k + 1, n, q) * 4));
      plot.append(link);
    }
    el.append(plot, labels);
  },
};

// funnel: up to five stages, each a centred bar whose width is its value over the first
// stage's, entering in turn from the top. A stage's name sits above its bar and its value counts
// beside it. Stagger follows the style's stagger.eachS and capS; every stage is done at p = 1.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const MAX_STAGES = 5;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  values: { type: 'string', default: '', meaning: 'comma list of up to five numbers, widest first' },
  labels: { type: 'string', default: '', meaning: 'comma list of stage names' },
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
  name: 'funnel',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const vals = String(prm.values || el.dataset.values || el.dataset.pValues || '')
      .split(',').map((s) => Number(s.trim())).filter(Number.isFinite).slice(0, MAX_STAGES);
    const names = String(prm.labels || el.dataset.labels || el.dataset.pLabels || '').split(',').map((s) => s.trim());
    const n = vals.length;
    const max = Math.max(...vals, 0) || 1;
    const size = SIZES.includes(prm.size) ? prm.size : 'body';
    const fix = Math.min(4, Math.max(0, Math.round(num(prm.fix, 0))));
    const st = ctx.style.motion.stagger;   // the style schema requires motion.stagger; no fallback
    const d = (ctx && ctx.d) > 0 ? ctx.d : 1;
    const span = n > 1 ? Math.min(0.6, Math.min(st.eachS * (n - 1), st.capS) / d) : 0;
    const gap = n > 1 ? span / (n - 1) : 0;

    el.classList.add('mm-funnel');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.replaceChildren();
    vals.forEach((v, i) => {
      const qi = clamp01((p - i * gap) / (1 - span));
      const row = doc.createElement('div');
      row.className = 'mm-funnel__row';
      row.style.opacity = String(clamp01(qi * 6));
      if (names[i]) {
        const lab = doc.createElement('div');
        lab.className = 'mm-funnel__label';
        lab.textContent = names[i];
        row.append(lab);
      }
      const line = doc.createElement('div');
      line.className = 'mm-funnel__line';
      const track = doc.createElement('div');
      track.className = 'mm-funnel__track';
      const bar = doc.createElement('div');
      bar.className = 'mm-funnel__bar';
      bar.style.width = `${(clamp01(Math.max(v, 0) / max) * qi * 100).toFixed(3)}%`;
      track.append(bar);
      const val = doc.createElement('div');
      val.className = 'mm-funnel__value';
      count(val, 0, v, qi, { fix, prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') });
      line.append(track, val);
      row.append(line);
      el.append(row);
    });
  },
};

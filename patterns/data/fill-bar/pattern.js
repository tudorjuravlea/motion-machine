// fill-bar: a track and a fill that grows to value / max, with a counting readout above it.
// The fill is a width, so the pill ends keep their radius while it grows. p is clamped at 1:
// the bar never passes the fact.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  max: { type: 'number', default: 100, meaning: 'the value that fills the track' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the readout' },
  prefix: { type: 'string', default: '', meaning: 'text before the readout' },
  suffix: { type: 'string', default: '%', meaning: 'text after the readout' },
  readout: { type: 'boolean', default: true, meaning: 'show the counting figure above the track' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the readout' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'fill-bar',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const q = clamp01(p);
    const value = num(el.dataset.value, 0);
    const max = num(prm.max, 100) || 100;
    const frac = clamp01(value / max);
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';
    const show = prm.readout !== false && prm.readout !== 'false';

    el.classList.add('mm-fillbar');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    if (show) {
      const r = doc.createElement('div');
      r.className = 'mm-fillbar__readout';
      count(r, 0, value, q, {
        fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))),
        prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''),
      });
      el.append(r);
    }
    const track = doc.createElement('div');
    track.className = 'mm-fillbar__track';
    const fill = doc.createElement('div');
    fill.className = 'mm-fillbar__fill';
    fill.style.width = `${(frac * q * 100).toFixed(3)}%`;
    track.append(fill);
    el.append(track);
  },
};

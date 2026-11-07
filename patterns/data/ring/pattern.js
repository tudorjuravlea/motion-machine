// ring: a circular progress stroke. The arc length is stroke-dasharray from p; the readout in
// the middle counts. The SVG is built from numbers only, with no namespace string, by the HTML
// parser. p is clamped at 1: the arc never passes the fact.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const R = 42;                              // radius in viewBox units (viewBox is 100 wide)
const C = 2 * Math.PI * R;

const PARAMS = {
  max: { type: 'number', default: 100, meaning: 'the value that closes the ring' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the readout' },
  prefix: { type: 'string', default: '', meaning: 'text before the readout' },
  suffix: { type: 'string', default: '%', meaning: 'text after the readout' },
  thick: { type: 'number', default: 8, meaning: 'stroke width in viewBox units (the ring is 100 wide)' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the readout; the ring is seven times it' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'ring',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const q = clamp01(p);
    const value = num(el.dataset.value, 0);
    const max = num(prm.max, 100) || 100;
    const len = C * clamp01(value / max) * q;
    const thick = Math.min(20, Math.max(1, num(prm.thick, 8)));
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';

    el.classList.add('mm-ring');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    const box = doc.createElement('div');
    box.className = 'mm-ring__box';
    box.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">`
      + `<circle class="mm-ring__track" cx="50" cy="50" r="${R}" fill="none" stroke-width="${thick}"/>`
      + `<circle class="mm-ring__fill" cx="50" cy="50" r="${R}" fill="none" stroke-width="${thick}" stroke-linecap="round"`
      + ` transform="rotate(-90 50 50)" stroke-dasharray="${len.toFixed(3)} ${C.toFixed(3)}"${len < 0.5 ? ' opacity="0"' : ''}/>`
      + `</svg>`;
    const r = doc.createElement('div');
    r.className = 'mm-ring__readout';
    count(r, 0, value, q, {
      fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))),
      prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''),
    });
    box.append(r);
    el.append(box);
  },
};

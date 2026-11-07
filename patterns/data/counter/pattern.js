// counter: a figure that counts from `from` to the beat's value in tabular digits, through the
// kit's count(). The number is drawn from p alone and p is clamped inside count(), so a spring's
// overshoot never shows a figure the fact does not carry. The prefix and suffix show only on the
// landed figure (no "1 rules" on a pausable frame); until then they hold their place.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  from: { type: 'number', default: 0, meaning: 'the figure counted up from' },
  fix: { type: 'number', default: 0, meaning: 'decimal places shown' },
  pad: { type: 'number', default: 0, meaning: 'minimum integer digits, zero-filled' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h1', meaning: 'the style size role of the figure' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M, 3B, 2T) and `fix` is the decimals of the scaled number' },
  unit: { type: 'enum(land|always)', default: 'land', meaning: 'land: the prefix and suffix keep their place but show only on the landed figure, so no frame reads "1 rules"; always: they count along' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'counter',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const size = SIZES.includes(prm.size) ? prm.size : 'h1';
    el.classList.add('mm-counter');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(p * 8));
    count(el, num(prm.from, 0), num(el.dataset.value, 0), p, {
      pad: Math.max(0, Math.round(num(prm.pad, 0))),
      fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))),
      prefix: String(prm.prefix ?? ''),
      suffix: String(prm.suffix ?? ''),
      hold: prm.unit !== 'always',
      compact: prm.format === 'compact',
    });
  },
};

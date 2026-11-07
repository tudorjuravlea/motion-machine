// data/versus: two figures across a seam, the before recessed (smaller, muted) and the after larger
// (in the tone role). The before counts first, a seam draws between them, then the after counts and
// settles to its full size (a scale in the type size, never past it: type never overshoots). The two
// figures are a comma list in `values` (before, after) and their names in `labels`; both count
// through the kit's count(), so neither passes its fact. Across the frame in a wide format, down it
// in a tall one (`axis` overrides). Everything is DOM text and boxes in palette roles.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const AXES = ['auto', 'across', 'down'];
const TONES = ['accent', 'ink'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const stage = (p, a, b) => clamp01((p - a) / (b - a));

const PARAMS = {
  values: { type: 'string', default: '', meaning: 'two numbers, before then after, as a comma list' },
  labels: { type: 'string', default: 'Before,After', meaning: 'two names, before then after, as a comma list' },
  axis: { type: 'enum(auto|across|down)', default: 'auto', meaning: 'across puts the figures side by side with a vertical seam, down stacks them with a horizontal one; auto is across in 16x9, down otherwise' },
  recess: { type: 'number', default: 0.62, meaning: 'the before figure\'s size as a share of the after figure\'s (0.3 to 1)' },
  tone: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the palette role of the after figure (the surface-ink-safe accent text, or ink)' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the figures' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text before each figure' },
  suffix: { type: 'string', default: '', meaning: 'text after each figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h1', meaning: 'the style size role of the after figure' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'versus',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const nums = String(prm.values ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter(Number.isFinite);
    const names = String(prm.labels ?? '').split(',').map((s) => s.trim());
    const size = SIZES.includes(prm.size) ? prm.size : 'h1';
    const axis = AXES.includes(prm.axis) && prm.axis !== 'auto' ? prm.axis : ctx?.format === '16x9' ? 'across' : 'down';
    const q = clamp01(p);
    el.classList.add('mm-versus');
    el.dataset.axis = axis;
    el.dataset.tone = TONES.includes(prm.tone) ? prm.tone : 'accent';
    el.style.setProperty('--mm-vs-size', `var(--mm-size-${size})`);
    el.style.setProperty('--mm-vs-recess', String(Math.min(1, Math.max(0.3, num(prm.recess, 0.62)))));
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    if (nums.length < 2) return;
    const fmt = { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' };
    const before = stage(q, 0, 0.4), seam = stage(q, 0.3, 0.55), after = stage(q, 0.45, 1);
    const side = (kind, label, value, x) => {
      const s = doc.createElement('div');
      s.className = `mm-versus__side mm-versus__side--${kind}`;
      const l = doc.createElement('div');
      l.className = 'mm-versus__label';
      l.textContent = label;
      l.style.opacity = String(clamp01(x * 3));
      const f = doc.createElement('div');
      f.className = 'mm-versus__figure';
      count(f, 0, value, x, fmt);
      f.style.opacity = String(clamp01(x * 6));
      s.append(l, f);
      return s;
    };
    const mid = doc.createElement('i');
    mid.className = 'mm-versus__seam';
    mid.setAttribute('aria-hidden', 'true');
    mid.style.transform = `${axis === 'across' ? 'scaleY' : 'scaleX'}(${seam.toFixed(4)})`;
    const b = side('before', names[0] ?? '', nums[0], before), a = side('after', names[1] ?? '', nums[1], after);
    a.style.setProperty('--mm-vs-grow', (0.86 + 0.14 * after).toFixed(4));
    el.append(b, mid, a);
  },
};

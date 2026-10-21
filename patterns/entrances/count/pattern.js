// entrances/count: a number counts up to its fact, on the style's move curve over the entrance.
// The target is the slot's data-value (the kit writes the beat's value there), else the first
// number in its text, with the words around it kept as an implicit prefix and suffix. Digits are tabular so the figure does not jitter, and count() clamps p, so a
// spring never shows a number the fact does not carry. The unit (prefix, suffix) shows only on the
// landed number. Writes the text, opacity and font-variant-numeric.
import { count } from '../../../runtime/kit/count.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  from: { type: 'number', default: 0, meaning: 'the number it counts up from' },
  prefix: { type: 'string', default: '', meaning: 'text before the number' },
  suffix: { type: 'string', default: '', meaning: 'text after the number, such as a unit or a percent sign' },
  fix: { type: 'number', default: -1, meaning: 'decimals; -1 takes them from the value' },
  pad: { type: 'number', default: 0, meaning: 'minimum integer digits, zero filled' },
  unit: { type: 'enum(land|always)', default: 'land', meaning: 'land: the prefix and suffix keep their place but show only on the landed number, so no frame reads "1 rules"; always: they count along' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function target(el) {
  const raw = el.dataset?.value;
  if (raw != null && raw !== '' && Number.isFinite(Number(raw))) return { to: Number(raw), text: String(raw), before: '', after: '' };
  const full = el.textContent || '';
  const m = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/.exec(full);
  if (!m) return null;
  const text = m[0].replace(/,/g, '');
  return { to: Number(text), text, before: full.slice(0, m.index), after: full.slice(m.index + m[0].length) };
}

export default {
  name: 'count',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const t = target(el);
    if (!t) { el.style.opacity = p >= 1 ? '' : String(clamp01(p)); return; }
    const fix = Number(prm.fix) >= 0 ? Number(prm.fix) : (t.text.split('.')[1] || '').length;
    // the count rides an in-out curve of linear time: a count that is 80 % done in a third of the
    // entrance reads as a jump, not as counting
    const lin = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const q = p >= 1 ? 1 : ctx.ease ? ctx.ease('move', lin) : lin;
    count(el, Number(prm.from), t.to, q, { pad: Number(prm.pad), fix, prefix: t.before + String(prm.prefix), suffix: String(prm.suffix) + t.after, hold: prm.unit !== 'always' });
    const o = clamp01(p * 4);
    el.style.opacity = o >= 1 ? '' : String(o);
  },
};

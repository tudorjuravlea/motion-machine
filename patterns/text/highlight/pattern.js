// text/highlight: the words are there almost at once and a marker sweeps behind them left to
// right, in the accent at low strength so the ink keeps its contrast. The sweep is a background
// that grows with p (a custom property carries p to the stylesheet). On a wrapped line every line
// box sweeps together, not one after another. Writes a span inside the slot and opacity.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  strength: { type: 'number', default: 0.35, meaning: 'accent mixed into the marker, 0.15 to 0.6' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const IN = 0.25;

export default {
  name: 'highlight',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = clamp01(p);
    const mark = el.ownerDocument.createElement('span');
    mark.className = 'mm-highlight__mark';
    mark.textContent = text;
    el.textContent = '';
    el.append(mark);
    mark.style.setProperty('--mm-hl-p', q.toFixed(5));
    mark.style.setProperty('--mm-hl-strength', String(Math.min(0.6, Math.max(0.15, Number(prm.strength)))));
    const o = clamp01(q / IN);
    el.style.opacity = o >= 1 ? '' : String(o);
  },
};

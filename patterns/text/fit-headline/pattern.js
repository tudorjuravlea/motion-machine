// text/fit-headline: sizes the headline to the measure its layout gives it, then rises in. It
// calls the kit's fit() after fonts are ready (the kit awaits document.fonts.ready before the
// first instant). Each line you break with a newline in the beat text is fitted separately to
// the widest line; by default the type only shrinks from the size the layout set, so the display
// scale stays the ceiling. Writes font-size, translate and opacity.
import { fit } from '../../../runtime/kit/fit.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  grow: { type: 'boolean', default: false, meaning: 'let the type grow past the layout size to fill the measure' },
  minRatio: { type: 'number', default: 0.5, meaning: 'smallest size as a fraction of the layout size' },
  d: { type: 'number', default: 32, meaning: 'rise in px before the style multiplier' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'fit-headline',
  group: 'text',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    el.style.fontSize = '';
    const authored = parseFloat(getComputedStyle(el).fontSize);
    const grow = prm.grow === true || prm.grow === 'true';
    fit(el, el.clientWidth, { max: grow ? Infinity : authored, min: authored * Number(prm.minRatio) });
    el.style.opacity = p >= 1 ? '' : String(clamp01(p));
    el.style.translate = p === 1 ? 'none' : `0 ${((1 - p) * Number(prm.d) * ctx.style.motion.travel).toFixed(3)}px`;
  },
};

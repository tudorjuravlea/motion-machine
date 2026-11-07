// emphasis/shine: one band of the accent colour sweeps across the element's text, like light
// crossing a surface, and leaves. The text is painted through a gradient (background-clip: text)
// only while the band is on it; at p = 0 and p = 1 the band is off the text and nothing is written,
// so nothing stays behind. On a bare text element the text goes in a span, so the band follows
// the words and not the block. Writes a span inside the element and its background and fill.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  angle: { type: 'number', default: 100, meaning: 'band angle in degrees' },
  width: { type: 'number', default: 18, meaning: 'band width as a percentage of the text width' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'shine',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    if (!(q > 0 && q < 1)) return;
    const w = Math.min(40, Math.max(6, Number(prm.width)));
    let target = el;
    if (!el.children.length) {
      target = el.ownerDocument.createElement('span');
      target.textContent = el.textContent;
      el.textContent = '';
      el.append(target);
    }
    const base = getComputedStyle(el).color;
    const c = -w + (100 + 2 * w) * q;
    const stop = (v) => `${v.toFixed(3)}%`;
    target.style.backgroundImage = `linear-gradient(${Number(prm.angle)}deg, ${base} ${stop(c - w)}, var(--mm-accent-text) ${stop(c)}, ${base} ${stop(c + w)})`;
    target.style.backgroundClip = 'text';
    target.style.webkitBackgroundClip = 'text';
    target.style.webkitTextFillColor = 'transparent';
  },
};

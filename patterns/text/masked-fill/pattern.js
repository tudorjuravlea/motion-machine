// text/masked-fill: the words are there as a faint outline and a fill rises inside the letterforms,
// bottom to top, led by a thin accent edge. The fill is a background clipped to the text, cloned
// per line box, so a wrapped slot fills every line together. At p = 1 the slot is its plain text
// again: nothing clipped, nothing left behind. Writes a span inside the slot.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  fill: { type: 'enum(ink|accent)', default: 'ink', meaning: 'the colour that rises inside the letters' },
  edge: { type: 'boolean', default: true, meaning: 'a thin accent edge leads the fill' },
};

function linear(ctx, p) {
  if (p >= 1) return 1;   // the kit calls an entrance finished within its tolerance of the end
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'masked-fill',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const own = getComputedStyle(el).color;   // the slot's own text colour (surfaceInk, accentInk …)
    const span = el.ownerDocument.createElement('span');
    span.className = 'mm-masked-fill';
    span.style.setProperty('--mm-mf-fill', own);
    span.textContent = text;
    el.textContent = '';
    el.append(span);
    span.style.setProperty('--mm-mf-p', q.toFixed(5));
    if (ctx.params?.fill === 'accent') span.dataset.fill = 'accent';
    if (ctx.params?.edge === false || ctx.params?.edge === 'false') span.dataset.edge = 'none';
  },
};

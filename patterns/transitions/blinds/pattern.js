// transitions/blinds: the incoming scene shows through slats that open together, like venetian
// blinds. A repeating-gradient mask (alpha only) on the incoming section, the period measured in
// frame heights or widths from the kit's frame variables; the outgoing scene stays whole beneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['mask-image', '-webkit-mask-image'];

const params = {
  slats: { type: 'number', default: 8, meaning: 'how many slats span the frame' },
  axis: { type: 'enum(horizontal|vertical)', default: 'horizontal', meaning: 'horizontal slats open downwards; vertical slats open to the right' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'blinds',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const slats = Math.max(1, Math.round(Number(ctx.params?.slats ?? params.slats.default)));
    const vertical = (ctx.params?.axis ?? params.axis.default) === 'vertical';
    const period = `calc(var(${vertical ? '--mm-frame-w' : '--mm-frame-h'}) / ${slats})`;
    const open = `calc(${period} * ${r3(clamp01(p))})`;
    const solid = 'var(--mm-color-ink)'; // the mask reads only alpha
    const mask = `repeating-linear-gradient(${vertical ? '90deg' : '180deg'}, ${solid} 0, ${solid} ${open}, transparent ${open}, transparent ${period})`;
    to.style.setProperty('mask-image', mask);
    to.style.setProperty('-webkit-mask-image', mask);
  },
};

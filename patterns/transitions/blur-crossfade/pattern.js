// transitions/blur-crossfade: a crossfade in which the outgoing scene defocuses while the incoming
// one pulls into focus. The blur radius is a --mm-space step times the unitless `amount` param.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['opacity', 'filter'];

const params = {
  amount: { type: 'number', default: 1, meaning: 'blur strength as a multiple of one space step (--mm-space-3)' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}
const blur = (k) => `blur(calc(var(--mm-space-3) * ${r3(k)}))`;

export default {
  name: 'blur-crossfade',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const amount = Number(ctx.params?.amount ?? params.amount.default);
    const q = clamp01(p);
    if (q > 0 && from) from.style.filter = blur(amount * q);
    to.style.opacity = r3(smooth(0, 1, q));
    if (q > 0) to.style.filter = blur(amount * (1 - q));
  },
};

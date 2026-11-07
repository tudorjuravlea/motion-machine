// transitions/clock-wipe: the incoming scene is revealed by a hand sweeping round the centre from
// twelve o'clock. A conic-gradient mask (alpha only) on the incoming section; the outgoing scene
// stays whole underneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['mask-image', '-webkit-mask-image'];

const params = {
  direction: { type: 'enum(clockwise|counter)', default: 'clockwise', meaning: 'which way the hand sweeps' },
};
const FEATHER = 1; // degrees of softness on the edge, so it does not shimmer

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'clock-wipe',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    // The mask reads only alpha: ink is just an opaque stop. Edge runs from -FEATHER (nothing) to 360.
    const edge = clamp01(p) * (360 + FEATHER) - FEATHER;
    const solid = 'var(--mm-color-ink)';
    const mask = (ctx.params?.direction ?? params.direction.default) === 'counter'
      ? `conic-gradient(from 0deg at 50% 50%, transparent ${r3(360 - edge - FEATHER)}deg, ${solid} ${r3(360 - edge)}deg)`
      : `conic-gradient(from 0deg at 50% 50%, ${solid} ${r3(edge)}deg, transparent ${r3(edge + FEATHER)}deg)`;
    to.style.setProperty('mask-image', mask);
    to.style.setProperty('-webkit-mask-image', mask);
  },
};

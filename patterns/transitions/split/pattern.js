// transitions/split: the incoming scene opens from a seam through the middle of the frame and
// spreads to both sides, like doors opening onto it. The seam is vertical or runs along the
// frame's diagonal. A clip-path on the incoming section; the outgoing scene stays whole underneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['clip-path'];

const params = {
  shape: { type: 'enum(diagonal|vertical)', default: 'diagonal', meaning: 'the seam the incoming scene opens along' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'split',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    if ((ctx.params?.shape ?? params.shape.default) === 'vertical') {
      const side = r3(50 * (1 - q));
      to.style.clipPath = `inset(0 ${side}% 0 ${side}%)`;
    } else {
      // A strip parallel to the bottom-left to top-right diagonal, s percent of the width either side.
      const s = q * 100;
      to.style.clipPath = `polygon(${r3(100 - s)}% 0%, ${r3(100 + s)}% 0%, ${r3(s)}% 100%, ${r3(-s)}% 100%)`;
    }
  },
};

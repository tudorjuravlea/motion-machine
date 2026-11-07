// transitions/zoom-out: the camera pulls back. The outgoing scene recedes and dissolves; the
// incoming scene settles from larger than the frame down to rest. The weight is in the recession.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform', 'opacity', 'filter'];

const params = {
  depth: { type: 'number', default: 0.6, meaning: 'how far the camera pulls back: 0.6 recedes the outgoing scene to 1 over 1.6 of its size' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'zoom-out',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const depth = Math.max(0, Number(ctx.params?.depth ?? params.depth.default));
    const q = clamp01(p);
    if (from) {
      from.style.transform = `scale(${r3(1 / (1 + depth * q))})`;
      from.style.opacity = r3(1 - smooth(0.2, 0.8, q));
      if (q > 0) from.style.filter = `blur(calc(var(--mm-space-3) * ${r3(depth * q)}))`;
    }
    to.style.transform = `scale(${r3(1 + depth * (1 - q))})`;
    to.style.opacity = r3(smooth(0.3, 0.9, q));
  },
};

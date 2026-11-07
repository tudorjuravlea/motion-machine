// entrances/slats: the element shows through vertical slats that open one after another, left to
// right (or top to bottom), each widening from its leading edge until the slats meet. An alpha mask
// with explicit stops, so the stagger needs no extra nodes. Writes mask-image only; at p = 1 nothing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

const params = {
  slats: { type: 'number', default: 6, meaning: 'how many slats cross the element, 3 to 12' },
  axis: { type: 'enum(vertical|horizontal)', default: 'vertical', meaning: 'vertical slats open left to right; horizontal ones top to bottom' },
};

export default {
  name: 'slats',
  group: 'entrances',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const q = clamp01(p);
    if (q >= 1) return;
    const n = Math.min(12, Math.max(3, Math.round(Number(ctx.params?.slats ?? 6))));
    const dir = (ctx.params?.axis ?? 'vertical') === 'horizontal' ? '180deg' : '90deg';
    const s = 0.4 / (n - 1);                    // each slat starts this much later than the one before
    const span = 1 - s * (n - 1);
    const solid = 'var(--mm-color-ink)';         // the mask reads only alpha
    const stops = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 100, open = clamp01((q - i * s) / span) * (100 / n);
      stops.push(`${solid} ${r3(a)}%`, `${solid} ${r3(a + open)}%`, `transparent ${r3(a + open)}%`, `transparent ${r3(a + 100 / n)}%`);
    }
    const mask = `linear-gradient(${dir}, ${stops.join(', ')})`;
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
  },
};

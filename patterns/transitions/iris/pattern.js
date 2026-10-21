// transitions/iris: the incoming scene opens from the centre of the frame through a growing
// circle or diamond (clip-path); the outgoing scene stays whole underneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['clip-path'];

const params = {
  shape: { type: 'enum(circle|diamond)', default: 'circle', meaning: 'the aperture: a circle or a diamond (a square turned 45 degrees)' },
};

// Width and height as a ratio, read from the format name ('16x9' -> 16 and 9).
function aspect(format) {
  const m = /^(\d+)x(\d+)$/.exec(String(format));
  return m ? [Number(m[1]), Number(m[2])] : [16, 9];
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'iris',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    if ((ctx.params?.shape ?? params.shape.default) === 'diamond') {
      // The diamond must reach the corner: |dx| + |dy| = (w + h) / 2 there.
      const [w, h] = aspect(ctx.format);
      const rx = (q * (w + h)) / (2 * w) * 100, ry = (q * (w + h)) / (2 * h) * 100;
      to.style.clipPath = `polygon(50% ${r3(50 - ry)}%, ${r3(50 + rx)}% 50%, 50% ${r3(50 + ry)}%, ${r3(50 - rx)}% 50%)`;
    } else {
      // circle() percentages read against sqrt((w^2 + h^2) / 2); the corner is 1 / sqrt(2) of that away.
      to.style.clipPath = `circle(${r3(q * Math.SQRT1_2 * 100)}% at 50% 50%)`;
    }
  },
};

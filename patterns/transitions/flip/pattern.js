// transitions/flip: the frame turns on its axis. The outgoing scene swings edge-on, the incoming
// scene swings out of edge-on to rest. Perspective is the unitless `perspective` param times the
// frame width, written inside the transform so no parent needs a perspective of its own.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform', 'visibility'];

const params = {
  perspective: { type: 'number', default: 2, meaning: 'camera distance in frame widths: smaller is more dramatic, 4 is nearly flat' },
  axis: { type: 'enum(y|x)', default: 'y', meaning: 'y turns about the vertical axis like a page, x about the horizontal like a departures board' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'flip',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const persp = Math.max(0.5, Number(ctx.params?.perspective ?? params.perspective.default));
    const rot = (ctx.params?.axis ?? params.axis.default) === 'x' ? 'rotateX' : 'rotateY';
    const view = `perspective(calc(var(--mm-frame-w) * ${r3(persp)}))`;
    const q = clamp01(p);
    if (q < 0.5) {
      if (from) from.style.transform = `${view} ${rot}(${r3(-q * 180)}deg)`;
      to.style.visibility = 'hidden';
    } else {
      if (from) from.style.visibility = 'hidden';
      to.style.transform = `${view} ${rot}(${r3((1 - q) * 180)}deg)`;
    }
  },
};

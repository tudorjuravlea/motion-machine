// transitions/color-dip: the outgoing scene dips into a flat colour, the incoming one rises out of
// it. The veil is a pseudo-element drawn by pattern.css from two custom properties written here;
// the kit restores the inline style on every seek, so no veil can outlive its frame.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['visibility', '--mm-tx-dip-o', '--mm-tx-dip-color'];

const params = {
  veil: { type: 'enum(canvas|ink)', default: 'canvas', meaning: 'the colour role the scene dips into' },
  hold: { type: 'number', default: 0.2, meaning: 'share of the transition spent fully covered, 0 to 0.8' },
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'color-dip',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const hold = Math.min(0.8, Math.max(0, Number(prm.hold)));
    const half = (1 - hold) / 2;
    const q = clamp01(p);
    const colour = prm.veil === 'ink' ? 'var(--mm-color-ink)' : 'var(--mm-color-canvas)';
    const cover = q < half ? smooth(0, half, q) : q > 1 - half ? 1 - smooth(1 - half, 1, q) : 1;
    const veiled = q < 0.5 ? from : to;
    if (!veiled) return;
    veiled.style.setProperty('--mm-tx-dip-color', colour);
    veiled.style.setProperty('--mm-tx-dip-o', r3(cover));
    if (q < 0.5) to.style.visibility = 'hidden';
  },
};

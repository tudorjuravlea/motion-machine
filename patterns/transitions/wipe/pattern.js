// transitions/wipe: a plate sweeps across the frame; the outgoing scene is cut away behind it.
// The outgoing section is clipped (clip-path) and carries the plate as a pseudo-element that
// pattern.css draws from the custom properties written here. The incoming scene lies underneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['z-index', 'clip-path', '--mm-tx-wipe-fill', '--mm-tx-wipe-inset', '--mm-tx-wipe-w', '--mm-tx-wipe-h', '--mm-tx-wipe-radius'];

const params = {
  plate: { type: 'enum(accent|surface)', default: 'accent', meaning: 'colour role of the plate that rides the edge' },
  direction: { type: 'enum(right|left|down|up)', default: 'right', meaning: 'where the wipe travels; right starts at the left edge' },
};

const T = 'var(--mm-space-5)'; // plate thickness
const R = 'var(--mm-radius-2)';

// edge(p): distance of the plate's near side from the start edge, -T at p = 0 and 100% at p = 1.
const edge = (p) => `calc(-1 * ${T} + (100% + ${T}) * ${r3(p)})`;

const GEOMETRY = {
  right: (b) => ({ clip: `inset(0 0 0 ${b})`, inset: `0 auto 0 ${b}`, w: T, h: 'auto', radius: `${R} 0 0 ${R}` }),
  left: (b) => ({ clip: `inset(0 ${b} 0 0)`, inset: `0 ${b} 0 auto`, w: T, h: 'auto', radius: `0 ${R} ${R} 0` }),
  down: (b) => ({ clip: `inset(${b} 0 0 0)`, inset: `${b} 0 auto 0`, w: 'auto', h: T, radius: `${R} ${R} 0 0` }),
  up: (b) => ({ clip: `inset(0 0 ${b} 0)`, inset: `auto 0 ${b} 0`, w: 'auto', h: T, radius: `0 0 ${R} ${R}` }),
};

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'wipe',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1 || !from) return;
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const g = (GEOMETRY[prm.direction] ?? GEOMETRY.right)(edge(clamp01(p)));
    const s = from.style;
    s.zIndex = '1';
    s.clipPath = g.clip;
    s.setProperty('--mm-tx-wipe-fill', prm.plate === 'surface' ? 'var(--mm-color-surface)' : 'var(--mm-color-accent)');
    s.setProperty('--mm-tx-wipe-inset', g.inset);
    s.setProperty('--mm-tx-wipe-w', g.w);
    s.setProperty('--mm-tx-wipe-h', g.h);
    s.setProperty('--mm-tx-wipe-radius', g.radius);
  },
};

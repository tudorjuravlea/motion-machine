// transitions/cover: the incoming scene slides in from one side and covers the outgoing scene,
// which holds perfectly still beneath it, like a poster laid over another. Only the incoming
// section moves (one full frame of travel, so no seam is left); the incoming section stays opaque,
// so every pixel shows one scene. The outgoing scene sinks under a scrim of the brand's darkest
// palette role (ink on a light brand, the canvas on a dark one), drawn by pattern.css from
// --mm-tx-cover-dim and --mm-tx-cover-shade, which the kit removes with the section's style on
// every seek.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform', '--mm-tx-cover-dim', '--mm-tx-cover-shade'];
const DIM_MAX = 0.6;

const params = {
  side: { type: 'enum(bottom|top|left|right)', default: 'bottom', meaning: 'the frame edge the incoming scene enters from' },
  dim: { type: 'number', default: 0.2, meaning: 'how far the outgoing scene sinks under a scrim of the darkest palette role by the end of the cut, 0 to 0.6' },
};
// Where the incoming section starts, as a share of its own size.
const START = { bottom: [0, 1], top: [0, -1], right: [1, 0], left: [-1, 0] };

// The darkest palette role by relative luminance (ink when the palette cannot be read).
function darkest(color) {
  const lum = (hex) => {
    const m = /^#([0-9a-f]{6})/i.exec(String(hex));
    if (!m) return Infinity;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  let best = 'ink', low = color ? lum(color.ink) : Infinity;
  for (const [role, hex] of Object.entries(color ?? {})) if (lum(hex) < low) { best = role; low = lum(hex); }
  return best;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'cover',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    const [sx, sy] = START[ctx.params?.side ?? params.side.default] ?? START.bottom;
    to.style.transform = `translate(${r3(sx * (1 - q) * 100)}%, ${r3(sy * (1 - q) * 100)}%)`;
    const dim = Math.min(DIM_MAX, Math.max(0, Number(ctx.params?.dim ?? params.dim.default) || 0));
    if (from && dim > 0) {
      from.style.setProperty('--mm-tx-cover-dim', r3(dim * q));
      from.style.setProperty('--mm-tx-cover-shade', `var(--mm-color-${darkest(ctx.style?.color)})`);
    }
  },
};

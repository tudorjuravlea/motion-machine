// transitions/beam: light opens the next scene. Four variants share one hot core of a palette role:
// - beam: a tilted front of light sweeps across; the incoming scene is laid open behind it;
// - curtain: two panels close over the outgoing scene from the sides, the scenes swap behind them,
//   and they part on the incoming one, with light along the seam;
// - portal: the incoming scene opens through a circle that grows from a point, lit at its rim;
// - streak: a long thin anamorphic streak crosses the frame; as it passes the middle a veil of the
//   light peaks and the scenes swap under it, then the streak leaves.
// The light is the role's colour at a share of opacity (the core nearly full, the glow falling away),
// never a literal white. The reveal is a clip-path on the incoming section; the light is an overlay
// node beside the sections, marked data-mm-overlay, so the kit removes it on every seek. Every
// number is a closed form of the cut's progress and the frame; nothing is carried between frames.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);
const r1 = (x) => String(Math.round(x * 10) / 10);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['clip-path', 'opacity', 'visibility'];

const params = {
  variant: { type: 'enum(beam|curtain|portal|streak)', default: 'beam', meaning: 'beam: a tilted front sweeps; curtain: two panels close and part; portal: opens from a point; streak: an anamorphic streak crosses' },
  light: { type: 'enum(accent|canvas|ink|surface)', default: 'accent', meaning: 'the palette role the light is made of, at a share of opacity (never white)' },
  strength: { type: 'number', default: 0.85, meaning: 'how strong the hot core is, 0.2 to 1' },
  width: { type: 'number', default: 0.3, meaning: 'how far the glow reaches, as a share of the frame\'s short side, 0.05 to 1' },
  weight: { type: 'number', default: 0.008, meaning: 'thickness of the hot core, as a share of the frame\'s short side, 0.002 to 0.04' },
  angle: { type: 'number', default: 18, meaning: 'beam: the tilt of the front from upright, in degrees, -45 to 45' },
  side: { type: 'enum(left|right)', default: 'left', meaning: 'beam and streak: the frame edge the light comes from' },
  at: { type: 'string', default: '50%,50%', meaning: 'portal: where it opens, "x%,y%" of the frame; streak: the height it crosses at (the y part)' },
  panel: { type: 'enum(ink|surface|canvas|accent)', default: 'ink', meaning: 'curtain: the palette role of the two panels' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) && v !== '' && v != null ? n : d)); };
const ROLES = { light: ['accent', 'canvas', 'ink', 'surface'], panel: ['ink', 'surface', 'canvas', 'accent'] };

/** The params as numbers and roles, clamped; anything unknown falls back to its default. */
export function settings(prm = {}) {
  const p = { ...DEFAULTS, ...prm };
  const [fx, fy] = String(p.at).split(',').map((s) => parseFloat(s));
  return {
    variant: ['beam', 'curtain', 'portal', 'streak'].includes(p.variant) ? p.variant : 'beam',
    light: ROLES.light.includes(p.light) ? p.light : 'accent',
    panel: ROLES.panel.includes(p.panel) ? p.panel : 'ink',
    strength: num(p.strength, DEFAULTS.strength, 0.2, 1),
    width: num(p.width, DEFAULTS.width, 0.05, 1),
    weight: num(p.weight, DEFAULTS.weight, 0.002, 0.04),
    angle: num(p.angle, DEFAULTS.angle, -45, 45),
    right: p.side === 'right',
    x: (Number.isFinite(fx) ? clamp01(fx / 100) : 0.5),
    y: (Number.isFinite(fy) ? clamp01(fy / 100) : 0.5),
  };
}

const tint = (role, a) => `color-mix(in srgb, var(--mm-color-${role}) ${r1(Math.max(0, Math.min(1, a)) * 100)}%, transparent)`;

/**
 * The light's falloff along a line as gradient stops: positions in px, strongest at `c`. `behind` and
 * `ahead` are how far the glow reaches either side; `e` is half the thickness of the hot core.
 */
export function profile(role, c, behind, ahead, e, s) {
  return [
    `transparent ${r1(c - behind)}px`,
    `${tint(role, 0.16 * s)} ${r1(c - behind * 0.5)}px`,
    `${tint(role, 0.5 * s)} ${r1(c - behind * 0.14)}px`,
    `${tint(role, s)} ${r1(c - e)}px`,
    `${tint(role, s)} ${r1(c + e)}px`,
    `${tint(role, 0.45 * s)} ${r1(c + ahead * 0.25)}px`,
    `${tint(role, 0.12 * s)} ${r1(c + ahead * 0.65)}px`,
    `transparent ${r1(c + ahead)}px`,
  ].join(', ');
}

/** The polygon (px) of the half-plane behind a front at distance s along d from the frame centre. */
export function halfPlane(W, H, dx, dy, s) {
  const R = 2 * (W + H), nx = -dy, ny = dx, cx = W / 2 + dx * s, cy = H / 2 + dy * s;
  const pts = [[cx + nx * R, cy + ny * R], [cx - nx * R, cy - ny * R], [cx - nx * R - dx * R, cy - ny * R - dy * R], [cx + nx * R - dx * R, cy + ny * R - dy * R]];
  return `polygon(${pts.map(([x, y]) => `${r1(x)}px ${r1(y)}px`).join(', ')})`;
}

/**
 * What to draw at progress p of a cut in a W x H frame: `show` (which scene is drawn: 'both', 'from' or
 * 'to'), `clip` (the incoming scene's clip-path, or null), and `layers`, the overlay's pieces as
 * [{ cls, style }] in CSS text. Pure.
 */
export function plan(W, H, p, prm = {}) {
  const s = settings(prm), q = clamp01(p), m = Math.min(W, H);
  const glow = s.width * m, core = Math.max(1, (s.weight * m) / 2);
  const behind = glow * 0.65, ahead = glow * 0.35;
  if (s.variant === 'beam') {
    const a = (s.angle * Math.PI) / 180, dx = s.right ? -Math.cos(a) : Math.cos(a), dy = Math.sin(a);
    const L = (W * Math.abs(dx) + H * Math.abs(dy)) / 2;                    // half the frame along d
    const c = -ahead + q * (2 * L + ahead + behind);                         // the front, from the start edge
    const css = (Math.atan2(dx, -dy) * 180) / Math.PI;                       // CSS gradient angle of d
    const haze = `linear-gradient(${r3(css)}deg, transparent ${r1(c - 2 * behind)}px, ${tint(s.light, 0.1 * s.strength)} ${r1(c - behind * 0.3)}px, transparent ${r1(c + ahead * 0.6)}px)`;
    return {
      show: 'both', clip: halfPlane(W, H, dx, dy, c - L),
      layers: [{ cls: 'beam', style: `background: linear-gradient(${r3(css)}deg, ${profile(s.light, c, behind, ahead, core, s.strength)}), ${haze}` }],
    };
  }
  if (s.variant === 'portal') {
    const cx = s.x * W, cy = s.y * H;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    const r = -ahead + q * (far + ahead + behind);
    return {
      show: 'both', clip: `circle(${r1(Math.max(0, r))}px at ${r1(cx)}px ${r1(cy)}px)`,
      layers: [{ cls: 'portal', style: `background: radial-gradient(circle at ${r1(cx)}px ${r1(cy)}px, ${profile(s.light, r, behind, ahead, core, s.strength)})` }],
    };
  }
  if (s.variant === 'curtain') {
    // close over the outgoing scene, swap behind the closed panels, part on the incoming one
    const CLOSE = 0.3;
    const k = q < CLOSE ? smooth(q / CLOSE) : 1 - smooth((q - CLOSE) / (1 - CLOSE));
    const half = (W / 2) * k, seam = Math.max(core * 2, glow * 0.3);
    const panel = (side) => {
      const edge = side === 'left' ? `left: 0; right: auto;` : `right: 0; left: auto;`;
      const toward = side === 'left' ? 'right' : 'left';
      // folds: soft vertical lights in the light role; the seam edge carries the glow
      const folds = `repeating-linear-gradient(90deg, ${tint(s.light, 0.1 * s.strength)} 0px, transparent ${r1(W * 0.012)}px, transparent ${r1(W * 0.03)}px)`;
      const rim = `linear-gradient(to ${toward}, transparent ${r1(Math.max(0, half - seam))}px, ${tint(s.light, 0.55 * s.strength)} ${r1(Math.max(0, half - core))}px, ${tint(s.light, s.strength)} ${r1(half)}px)`;
      return { cls: 'curtain', style: `${edge} width: ${r1(half)}px; background: ${rim}, ${folds}, var(--mm-color-${s.panel});` };
    };
    const glowL = { cls: 'curtain-glow', style: `left: ${r1(half)}px; width: ${r1(glow * 0.35)}px; background: linear-gradient(to right, ${tint(s.light, 0.4 * s.strength)}, transparent)` };
    const glowR = { cls: 'curtain-glow', style: `right: ${r1(half)}px; width: ${r1(glow * 0.35)}px; background: linear-gradient(to left, ${tint(s.light, 0.4 * s.strength)}, transparent)` };
    return { show: q < CLOSE ? 'from' : 'to', clip: null, layers: half > 0.5 ? [panel('left'), panel('right'), glowL, glowR] : [] };
  }
  // streak: crosses the frame; the veil peaks as it passes the middle and the scenes swap under it
  const len = W * 1.9, tall = Math.max(glow * 0.45, core * 8), y = s.y * H;
  const cx = s.right ? W + len / 2 - q * (W + len) : -len / 2 + q * (W + len);   // it starts wholly off one side, is centred at the swap, and ends wholly off the other
  const bump = Math.sin(Math.PI * q) ** 2;
  const along = 'linear-gradient(90deg, transparent 0%, var(--mm-color-ink) 18%, var(--mm-color-ink) 82%, transparent 100%)';   // alpha only
  const across = `radial-gradient(ellipse closest-side at 50% 50%, ${tint(s.light, s.strength)} 0%, ${tint(s.light, 0.55 * s.strength)} ${r1(core / tall * 100)}%, ${tint(s.light, 0.14 * s.strength)} 45%, transparent 100%)`;
  return {
    show: q < 0.5 ? 'from' : 'to', clip: null,
    layers: [
      { cls: 'veil', style: `background: ${tint(s.light, 0.55 * s.strength * bump)}` },
      { cls: 'streak', style: `left: ${r1(cx - len / 2)}px; top: ${r1(y - tall / 2)}px; width: ${r1(len)}px; height: ${r1(tall)}px; background: ${across}; mask-image: ${along}; -webkit-mask-image: ${along}` },
    ],
  };
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}
const hide = (el) => { if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } };

export default {
  name: 'beam',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1 || !from) return;
    const W = to.offsetWidth || 1, H = to.offsetHeight || 1;
    const pl = plan(W, H, p, ctx.params);
    if (pl.show === 'from') hide(to);
    if (pl.show === 'to') hide(from);
    if (pl.clip) to.style.clipPath = pl.clip;
    const stage = to.parentNode;
    if (!stage || !pl.layers.length) return;
    const doc = to.ownerDocument;
    const root = doc.createElement('div');
    root.className = `mm-tx-beam mm-tx-beam--${settings(ctx.params).variant}`;
    root.setAttribute('data-mm-overlay', '');
    root.setAttribute('aria-hidden', 'true');
    for (const l of pl.layers) {
      const part = doc.createElement('div');
      part.className = `mm-tx-beam__${l.cls}`;
      part.style.cssText = l.style;
      root.append(part);
    }
    stage.append(root);
  },
};

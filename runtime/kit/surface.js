// The glass surface (SPEC §3): a card treatment any card-like pattern can opt into with the param
// `surface: glass` (`flat` is the default and changes nothing). The brand's `surface` block sets the
// look once, as `--mm-surface-*` custom properties on <html>, and the kit's base CSS paints every
// element marked `data-glass` inside a `data-surface="glass"` scope with them: a diagonal tint of
// the surface role at partial strength, the backdrop blurred behind it, a hairline in the line role,
// an inner top highlight, a soft shadow and, on arrival, one shine bar at a fixed angle that sweeps
// once. Every colour is a palette role (the highlight is the lighter of ink and canvas, the shadow
// the darker), so G-BRAND holds by construction. Pure arithmetic, importable in Node.

/**
 * What a brand's `surface` block reads when it leaves a field out. `tint` the share of the surface
 * role in the fill at its strongest corner; `blur` the backdrop blur, a share of the frame width;
 * `saturate` the backdrop's saturation (1 leaves the colours alone; above 1 shifts them off the
 * palette, so the gate may object); `border` the hairline's share of the line role; `highlight` the
 * inner top edge's share of the light role; `shadow` the drop shadow's share of the dark role;
 * `shine` the shine bar's share of the light role (0 for none); `angle` its lean from the vertical, in
 * degrees; `shineWidth` its width as a share of the card.
 */
export const SURFACE_DEFAULTS = { tint: 0.5, blur: 0.012, saturate: 1, border: 0.8, highlight: 0.3, shadow: 0.45, shine: 0.22, angle: 14, shineWidth: 0.07 };

// the fill is a diagonal of four stops around `tint`, strongest at the top left
const FILL = [1.2, 0.85, 1, 0.7];
const SHINE_START = 0.3;   // the shine sweeps over the last 70 % of the arrival
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pct = (v) => `${Math.round(Math.min(100, Math.max(0, v * 100)) * 100) / 100}%`;
const px = (v) => `${Math.round(v * 100) / 100}px`;
const tint = (role, share) => `color-mix(in srgb, var(--mm-color-${role}) ${pct(share)}, transparent)`;

/** A brand's surface block with every field filled in. */
export const surfaceSpec = (surface) => ({ ...SURFACE_DEFAULTS, ...(surface ?? {}) });

// WCAG relative luminance of a #rrggbb colour
const lum = (hex) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};

/** The roles light falls and shadow lies in: the lighter and the darker of ink and canvas. */
export function glassRoles(color) {
  return lum(color.ink) >= lum(color.canvas) ? { light: 'ink', dark: 'canvas' } : { light: 'canvas', dark: 'ink' };
}

/**
 * The custom properties the kit sets on <html> for the glass surface: `--mm-surface-fill` (the
 * diagonal tint), `-blur`, `-saturate`, `-shadow` (hairline, top highlight and drop shadow as one
 * box-shadow) and `-shine` (the bar), `-shine-size` (its background size: the bar is a stripe of a
 * gradient wider than the card, so one gradient serves any card).
 * @param {object} [surface] the brand's `surface` block
 * @param {{ w: number }} frame the format's frame, px
 * @param {{ canvas: string, ink: string }} color the palette
 */
export function surfaceVars(surface, frame, color) {
  const s = surfaceSpec(surface);
  const { light, dark } = glassRoles(color);
  const hair = Math.max(1, Math.round(frame.w / 1000));
  const fill = `linear-gradient(135deg, ${FILL.map((k, i) => `${tint('surface', s.tint * k)} ${[0, 35, 70, 100][i]}%`).join(', ')})`;
  const shadow = [
    `inset 0 0 0 ${px(hair)} ${tint('line', s.border)}`,
    `inset 0 ${px(hair)} 0 0 ${tint(light, s.highlight)}`,
    `0 ${px(frame.w * 0.012)} ${px(frame.w * 0.035)} ${tint(dark, s.shadow)}`,
  ].join(', ');
  // a stripe 2.6 card-widths wide, centred, leaning by `angle`: the gradient line is perpendicular to the stripe
  const half = (s.shineWidth * 100) / 2.6 / 2;
  const bar = tint(light, s.shine);
  const shine = `linear-gradient(${90 + s.angle}deg, transparent ${50 - half}%, ${bar} 50%, transparent ${50 + half}%)`;
  return {
    '--mm-surface-fill': fill,
    '--mm-surface-blur': px(s.blur * frame.w),
    '--mm-surface-saturate': String(s.saturate),
    '--mm-surface-shadow': shadow,
    '--mm-surface-shine': s.shine > 0 ? shine : 'linear-gradient(transparent, transparent)',
  };
}

/**
 * Where the shine bar is at linear arrival progress `q`: a background-position-x for the kit's
 * stripe (the stripe is 2.6 card-widths wide, so its centre crosses the card from 0.35 widths left
 * of it to 0.35 right of it), or null when the bar is off the card (before it starts and after it
 * ends: a rest never shows it). `move` maps 0..1 to 0..1 (the style's move easing).
 */
export function shinePosition(q, move = (p) => p) {
  if (!(q > SHINE_START) || q >= 1) return null;
  const s = move(clamp01((q - SHINE_START) / (1 - SHINE_START)));
  const centre = -0.35 + s * 1.7;           // the stripe's centre, in card widths from the card's left edge
  return `${Math.round(((1.3 - centre) / 1.6) * 1e4) / 100}%`;
}

/**
 * Opts an element into the surface from a pattern's `surface` param. Marks it `data-glass` (the
 * kit's CSS paints it) and scopes it with `data-surface`; `flat` (or anything else) removes both,
 * so the pattern is exactly as it was. A layout does this in its markup instead: `data-glass` on
 * each card, and the kit sets `data-surface` on the layout's root from the param.
 */
export function glass(el, mode) {
  if (mode === 'glass') { el.setAttribute('data-glass', ''); el.setAttribute('data-surface', 'glass'); }
  else { el.removeAttribute('data-glass'); el.removeAttribute('data-surface'); }
}

// The arithmetic of a recording shown on a branded ground (devices/demo-frame, and the tilt that
// screen/zoom-to gives it). Pure, and everything is a fraction of the stage or a page pixel (the page
// is 1080 px on its short side in every format), so the look is the same at 9x16, 1x1 and 16x9.
//
// Adapted from OpenScreen (siddharthvaddem/openscreen, MIT, Copyright (c) 2025 Siddharth Vaddem; see
// NOTICE): the padding law, the three-layer drop shadow, the three tilt presets and the perspective
// at 2.6 times the short side. The colour of the shadow is a palette role here, never black.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The share of the stage a recording takes: padding 0..1 gives up to 40 % of it (0.5 leaves 0.8). */
export function paddingScale(padding) {
  return 1 - clamp(num(padding), 0, 1) * 0.4;
}

/** Three shadow layers at one intensity 0..1: the offset down, the blur and the opacity of each, in page px. */
export function shadowStack(intensity) {
  const i = clamp(num(intensity), 0, 1);
  return [{ y: 12 * i, blur: 48 * i, alpha: 0.7 * i }, { y: 4 * i, blur: 16 * i, alpha: 0.5 * i }, { y: 2 * i, blur: 8 * i, alpha: 0.3 * i }];
}

const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const r = (n) => Math.round(n * 1000) / 1000;

/**
 * The shadow as a CSS `filter`: three `drop-shadow()`s in one palette role (a tint of it, never a mix
 * of two roles). A filter follows what is drawn, so on a plane that is rotated it shadows the rotated
 * silhouette. 'none' at intensity 0.
 */
export function shadowCss(intensity, role = 'ink') {
  const layers = shadowStack(intensity).filter((l) => l.alpha > 0);
  if (!layers.length) return 'none';
  const colour = ROLES.includes(role) ? role : 'ink';
  return layers.map((l) => `drop-shadow(0 ${r(l.y)}px ${r(l.blur)}px color-mix(in srgb, var(--mm-color-${colour}) ${r(l.alpha * 100)}%, transparent))`).join(' ');
}

/** The tilt presets, as rotateX and rotateY in degrees. */
export const TILTS = { none: { x: 0, y: 0 }, iso: { x: -10, y: -16 }, left: { x: 0, y: -22 }, right: { x: 0, y: 22 } };

/** A preset by name; a name that is not one is flat. */
export function tiltOf(kind) {
  return TILTS[kind] ? { ...TILTS[kind] } : { x: 0, y: 0 };
}

/** A tilt between two, a fraction `t` of the way (adding 0 keeps a zero from being -0). */
export function lerpTilt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t + 0, y: a.y + (b.y - a.y) * t + 0 };
}

/** The perspective distance: 2.6 times the plane's short side. */
export function perspectivePx(w, h) {
  return 2.6 * Math.min(w, h);
}

/**
 * The scale (at most 1) that keeps a w x h plane, rotated like `rotateX(x) rotateY(y)` under
 * `perspective(perspectivePx)`, inside the rectangle it started in: its four projected corners are
 * found and the plane shrinks until the farthest one touches. Depends on the shape, not the size.
 */
export function containScale(tilt, w, h) {
  if (!(w > 0 && h > 0) || (!tilt.x && !tilt.y)) return 1;
  const P = perspectivePx(w, h), ax = (tilt.x * Math.PI) / 180, ay = (tilt.y * Math.PI) / 180;
  let worst = 0;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = (sx * w) / 2, y = (sy * h) / 2;
    const x1 = x * Math.cos(ay), z1 = -x * Math.sin(ay);
    const y2 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
    const k = 1 - z2 / P;
    worst = Math.max(worst, Math.abs(x1 / k) / (w / 2), Math.abs(y2 / k) / (h / 2));
  }
  return worst > 1 ? 1 / worst : 1;
}

/** The CSS transform for a tilt: the contain scale after the projection, so nothing leaves the rectangle; 'none' when flat. */
export function tiltTransform(tilt, w, h) {
  if (!tilt.x && !tilt.y) return 'none';
  return `scale(${r(containScale(tilt, w, h))}) perspective(${r(perspectivePx(w, h))}px) rotateX(${r(tilt.x)}deg) rotateY(${r(tilt.y)}deg)`;
}

/** The largest plane of an aspect (width over height) inside the stage once padding has taken its share. */
export function fitPlane(stage, ratio, padding) {
  const k = paddingScale(padding), W = stage.w * k, H = stage.h * k;
  const q = ratio > 0 ? ratio : 16 / 10;
  return W / H <= q ? { w: W, h: W / q } : { w: H * q, h: H };
}

// A brand's motion as tokens a developer can paste (SPEC §6, `mm style export-motion`) and as curves the brand sheet
// plots. Pure: no files, no browser.
//
//   easings   each ease as a CSS timing function: the string itself for a keyword or cubic-bezier (exact), steps()
//             for steps, a sampled linear() for the rest; plus the four bezier numbers where there are four.
//   springs   each spring as a duration (the settle time) and a sampled linear() easing, so a page plays it with no
//             script; as { type: "spring", visualDuration, bounce } for the Motion API (exact when the spring has
//             no initial velocity and, if over-damped, soft landing); and as its physics { stiffness, damping,
//             mass, velocity }, which is always exact.
import { bezierPoints, cssEasing, parseEasing, toLinear } from '../../runtime/kit/ease.js';
import { spring } from '../../runtime/kit/springs.js';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const MAX_MS = 20000;

/** One ease: { ease, css, exact, cubicBezier, overshoot }. */
export function easeToken(str) {
  const f = parseEasing(str);
  const { css, exact } = cssEasing(str);
  return { ease: str, css, exact, cubicBezier: bezierPoints(str), overshoot: r4(Math.max(0, f.maxUpTo(1) - 1)) };
}

/** One spring: { params, settleMs, overshoot, css: { duration, easing }, motion, motionExact, physics }. */
export function springToken(params) {
  const { w0, zeta, velocity } = spring.physics(params);
  const settle = spring.settle(params);
  const ms = Math.min(MAX_MS, Math.max(1, Math.round(settle * 1000)));
  const f = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : spring((ms / 1000) * p, params));
  const bounce = zeta <= 1 ? 1 - zeta : 1 / zeta - 1;
  // Motion reads visualDuration / bounce as: damping ratio 1 - bounce (bounce >= 0) or 1 / (1 + bounce) with the soft
  // landing; it floors the ratio at 0.05 and ignores an inherited velocity for a spring given this way
  const exact = velocity === 0 && zeta >= 0.05 && (zeta <= 1 || params.soft === true);
  const period = typeof params.period === 'number' ? params.period : (2 * Math.PI) / w0;   // before any soft-landing rescale
  return {
    params,
    settleMs: ms,
    overshoot: r4(spring.overshoot(params)),
    css: { duration: `${ms}ms`, easing: toLinear(f) },
    motion: { type: 'spring', visualDuration: r4(period / 1.2), bounce: r4(Math.max(-1, Math.min(1, bounce))) },
    motionExact: exact,
    physics: { type: 'spring', stiffness: r4(w0 * w0), damping: r4(2 * zeta * w0), mass: 1, velocity },
  };
}

/** The tokens of a composed style: { name, durations, easings: {role: easeToken}, springs: {role: springToken} }. */
export function motionTokens(style) {
  const m = style.motion;
  return {
    name: style.name,
    durations: { ...m.durations },
    easings: Object.fromEntries(Object.entries(m.easings).map(([k, v]) => [k, easeToken(v)])),
    springs: Object.fromEntries(Object.entries(m.spring).map(([k, v]) => [k, springToken(v)])),
  };
}

/** The tokens as a CSS file of custom properties. */
export function toCss(t) {
  const lines = [
    `/* Motion tokens for ${t.name}, from \`mm style export-motion\`.`,
    ' * An easing is a CSS timing function. A spring is a duration (its settle time) and a linear() easing sampled from',
    ' * the closed-form spring, so a page plays it with no script:',
    ' *   transition: transform var(--mm-spring-ui-duration) var(--mm-spring-ui); */',
    ':root {',
    ...Object.entries(t.durations).map(([k, v]) => `  --mm-dur-${k}: ${v}ms;`),
    ...Object.entries(t.easings).map(([k, v]) => `  --mm-ease-${k}: ${v.css};`),
    ...Object.entries(t.springs).flatMap(([k, v]) => [`  --mm-spring-${k}-duration: ${v.css.duration};`, `  --mm-spring-${k}: ${v.css.easing};`]),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

/** The tokens as JSON text: the same data, with the Motion-API form of each spring beside its physics. */
export function toJson(t) {
  return `${JSON.stringify(t, null, 2)}\n`;
}

// ------------------------------------------------------------------ curves for the brand sheet

const W = 240, H = 120, PAD = 10;

/** A polyline path through points mapped into the box. */
function path(pts, x0, x1, y0, y1) {
  const X = (x) => PAD + ((x - x0) / (x1 - x0)) * (W - 2 * PAD), Y = (y) => H - PAD - ((y - y0) / (y1 - y0)) * (H - 2 * PAD);
  return { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r4(X(x))},${r4(Y(y))}`).join(' '), X, Y };
}

/**
 * One plot per ease and spring of a motion half: [{ name, kind, d, targetY, startY, settleX, settle, overshoot, label }]
 * with `d` an SVG path in a 240 x 120 box. An ease is plotted over its progress, a spring over time up to a fifth past
 * its settle time, with a mark where it settles.
 */
export function curvePlots(motion) {
  const out = [];
  for (const [name, str] of Object.entries(motion.easings ?? {})) {
    const f = parseEasing(str);
    const pts = Array.from({ length: 121 }, (_, i) => [i / 120, f(i / 120)]);
    const lo = Math.min(0, ...pts.map((p) => p[1])), hi = Math.max(1, ...pts.map((p) => p[1]));
    const { d, Y } = path(pts, 0, 1, lo, hi);
    out.push({ name, kind: 'ease', spec: str, d, targetY: r4(Y(1)), startY: r4(Y(0)), settleX: null, settle: null, overshoot: r4(Math.max(0, f.maxUpTo(1) - 1)) });
  }
  for (const [name, p] of Object.entries(motion.spring ?? {})) {
    const settle = spring.settle(p), T = Math.max(settle * 1.2, 0.05);
    const pts = Array.from({ length: 161 }, (_, i) => [(T * i) / 160, spring((T * i) / 160, p)]);
    const lo = Math.min(0, ...pts.map((q) => q[1])), hi = Math.max(1, ...pts.map((q) => q[1]));
    const { d, X, Y } = path(pts, 0, T, lo, hi);
    out.push({ name, kind: 'spring', spec: p, d, targetY: r4(Y(1)), startY: r4(Y(0)), settleX: r4(X(settle)), settle: Math.round(settle * 1000), overshoot: r4(spring.overshoot(p)) });
  }
  return out;
}

export const PLOT = { w: W, h: H };

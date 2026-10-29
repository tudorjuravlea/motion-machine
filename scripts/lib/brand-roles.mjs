// The role rules a brand palette goes through before a person reviews it. Pure functions of the seven
// roles (and their confidence): the text-on-background pairs and their contrast, the fixes a measured or
// guessed colour may receive (muted moved toward the ink until it reads, an ink on the accent or on a
// surface that reads), the warnings that make a wrong role obvious (an accent that is the ink, a surface
// that is the canvas), and the questions left for a person. A colour named exactly by the brand (a token)
// or set by hand is never changed: a rule that would change it becomes a question instead.
import { chroma, contrast, luminance, mix, parseHex } from '../capture-brand.mjs';

export const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const LOCKED = new Set(['exact', 'set']);
const r1 = (x) => Math.round(x * 10) / 10;

/** CIE76 colour difference in CIELAB (D65): 0 for one colour, about 100 between black and white. */
export function deltaE(a, b) {
  const lab = (h) => {
    const [r, g, bl] = parseHex(h).map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The first mix of `color` toward `target` (in steps of 1 %) whose contrast with `bg` reaches `need`; t = 0 when it already does. */
export function fixToward(color, target, bg, need) {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const hex = i === 0 ? color : mix(color, target, t);
    if (contrast(hex, bg) >= need) return { hex, t };
  }
  return { hex: target, t: 1 };
}

/** Every text-on-background pair of a palette ({role: hex}), with its ratio, the ratio it needs and whether it passes. */
export function pairsOf(c) {
  const rows = [
    { fg: 'ink', bg: 'canvas', use: 'body text', need: 4.5, aim: 7 },
    { fg: 'muted', bg: 'canvas', use: 'secondary text', need: 4.5 },
    { fg: 'accent', bg: 'canvas', use: 'the accent as large text', need: 3 },
    { fg: 'accentInk', bg: 'accent', use: 'text on the accent', need: 4.5 },
    { fg: c.surfaceInk ? 'surfaceInk' : 'ink', bg: 'surface', use: 'text on a surface', need: 4.5 },
    { fg: 'line', bg: 'canvas', use: 'rules and borders (not text)', need: 1.15 },
  ];
  return rows.map((p) => {
    const ratio = Math.round(contrast(c[p.fg], c[p.bg]) * 100) / 100;
    return { ...p, ratio, pass: ratio >= p.need };
  });
}

/**
 * Applies the role rules to `input` ({role: {hex, confidence, source, evidence}}; confidence is exact,
 * set, measured, rule or guess). Returns { roles, accentText, warnings, ask, notes }: roles with every
 * fix applied and recorded as `fixed: {from, to, why}` (a surfaceInk added when ink does not read on the
 * surface), warnings as {id, text}, questions as {id, role, question, options: [{label, value}]}. Never
 * changes the input.
 */
export function reviewRoles(input) {
  const roles = structuredClone(input);
  const warnings = []; const ask = []; const notes = [];
  const hex = (r) => roles[r].hex;
  const locked = (r) => LOCKED.has(roles[r]?.confidence);
  const fix = (r, to, why) => { roles[r] = { ...roles[r], hex: to, fixed: { from: roles[r].hex, to, why } }; };
  const question = (role, q, options) => ask.push({ id: role, role, question: q, options });
  const canvas = hex('canvas');

  const ic = contrast(hex('ink'), canvas);
  if (ic < 7) warnings.push({ id: 'ink-weak', text: `ink on the canvas is ${r1(ic)}:1; body text reads best at 7:1, and 4.5:1 is the minimum` });
  if (ic < 4.5) {
    const toward = luminance(canvas) > 0.18 ? '#000000' : '#FFFFFF';
    question('ink', `The ink is ${r1(ic)}:1 on the canvas, too faint for text. Which ink?`,
      [{ label: 'a stronger ink (7:1)', value: fixToward(hex('ink'), toward, canvas, 7).hex }, { label: 'keep it', value: hex('ink') }]);
  }

  const mc = contrast(hex('muted'), canvas);
  if (mc < 4.5) {
    const f = fixToward(hex('muted'), hex('ink'), canvas, 4.5);
    const why = `muted on the canvas was ${r1(mc)}:1, under the 4.5:1 text minimum; moved ${Math.round(f.t * 100)}% toward the ink`;
    if (locked('muted')) question('muted', `The muted colour is ${r1(mc)}:1 on the canvas, under 4.5:1 for text. Use a fixed one?`,
      [{ label: 'fixed (4.5:1)', value: f.hex }, { label: 'keep it', value: hex('muted') }]);
    else fix('muted', f.hex, why);
  }
  if (contrast(hex('muted'), canvas) >= contrast(hex('ink'), canvas)) warnings.push({ id: 'muted-not-quieter', text: 'the muted colour stands out more than the ink; one of the two is probably the wrong role' });

  const likeInk = deltaE(hex('accent'), hex('ink')) < 10; const likeCanvas = deltaE(hex('accent'), canvas) < 10;
  if (likeInk) warnings.push({ id: 'accent-like-ink', text: 'the accent is almost the ink: the brand colour was probably not found' });
  if (likeCanvas) warnings.push({ id: 'accent-like-canvas', text: 'the accent is almost the canvas: the brand colour was probably not found' });
  if ((likeInk || likeCanvas) && !locked('accent')) question('accent', 'The accent looks like the ink or the canvas. What is the brand colour?', [{ label: 'keep it', value: hex('accent') }]);
  if (chroma(hex('accent')) < 0.15) warnings.push({ id: 'accent-grey', text: 'the accent is nearly grey; a brand colour is usually saturated' });

  let accentText = true;
  const ac = contrast(hex('accent'), canvas);
  if (ac < 3) { accentText = false; notes.push(`accentText off: the accent is ${r1(ac)}:1 on the canvas, under 3:1, so text is never tinted with it (fills keep it)`); }
  else if (ac < 4.5) warnings.push({ id: 'accent-large-only', text: `the accent is ${r1(ac)}:1 on the canvas: fine for large text and fills, too faint for body text` });

  const aic = contrast(hex('accentInk'), hex('accent'));
  if (aic < 4.5) {
    const best = [hex('ink'), canvas].sort((a, b) => contrast(b, hex('accent')) - contrast(a, hex('accent')))[0];
    if (best !== hex('accentInk') && contrast(best, hex('accent')) > aic) {
      const why = `text on the accent was ${r1(aic)}:1; ${best} reads at ${r1(contrast(best, hex('accent')))}:1`;
      if (locked('accentInk')) question('accentInk', `Text on the accent is ${r1(aic)}:1. Use ${best} instead?`, [{ label: 'the better one', value: best }, { label: 'keep it', value: hex('accentInk') }]);
      else fix('accentInk', best, why);
    }
    if (contrast(hex('accentInk'), hex('accent')) < 4.5) warnings.push({ id: 'accent-ink-weak', text: `text on the accent reads at ${r1(contrast(hex('accentInk'), hex('accent')))}:1 at best (neither ink nor canvas reaches 4.5:1)` });
  }

  if (deltaE(hex('surface'), canvas) < 2) warnings.push({ id: 'surface-same-as-canvas', text: 'the surface is the canvas: cards and panels will not stand apart' });
  const sc = contrast(hex('ink'), hex('surface'));
  if (sc < 4.5 && !roles.surfaceInk) {
    const best = [hex('ink'), canvas].sort((a, b) => contrast(b, hex('surface')) - contrast(a, hex('surface')))[0];
    roles.surfaceInk = { hex: best, confidence: 'rule', source: 'rule', evidence: `ink on the surface is ${r1(sc)}:1; ${best} reads at ${r1(contrast(best, hex('surface')))}:1` };
  }

  const lc = contrast(hex('line'), canvas);
  if (lc < 1.15) warnings.push({ id: 'line-invisible', text: `rules and borders are ${lc.toFixed(2)}:1 on the canvas and will not show` });

  for (const r of ROLES) {
    if (roles[r]?.confidence === 'guess' && !ask.some((a) => a.role === r)) {
      question(r, `The ${r} colour was guessed (${roles[r].evidence}). Keep ${hex(r)}?`, [{ label: 'keep it', value: hex(r) }]);
    }
  }
  return { roles, accentText, warnings, ask, notes };
}

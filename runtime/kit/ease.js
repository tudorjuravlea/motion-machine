// Easing curves (SPEC §6). Pure: every ease is a function of p alone, exactly 0 at p <= 0 and exactly 1
// at p >= 1. `ease(name, p, style)` accepts a style role ('enter', 'exit', 'move', or any role the style
// names, resolved through style.motion.easings) or an ease spelled out.
//
// The ease grammar (the same string in style.json, in a beat's params and in a call):
//   linear · ease · ease-in · ease-out · ease-in-out · none · cubic-bezier(a, b, c, d)
//   <family>[.<type>][(args)]        family: power(n) quad cubic quart quint sine circ expo back(overshoot)
//                                    elastic(amplitude, period) bounce; type: in out inOut outIn (bare = out)
//   steps(n[, start|end])            n jumps; the last frame is 1
//   irregular(n[, randomness[, seed]])   a seeded uneven cadence
//   slowMo(ratio, power)             fast edges, a slow middle
//   expoScale(a, b[, ease])          constant-rate zoom, for scale a to b
//   bias(ease, r)                    lean any ease: r in -1..1, 0 leaves it alone
//   linear(0, .25 50%, 1)            CSS linear() stops
//   curve(M0,0 C…) · curve(x1, y1, x2, y2) · curve(0,0, …)    a custom curve (curve.js)
//   anticipate · reverse(ease) · mirror(ease)
// The camelCase spellings outQuad, inOutBack(2) are read too. Anything else throws a TypeError.

import { cubicBezier, curve } from './curve.js';
import { random } from './random.js';

export { cubicBezier };

const KEYWORDS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
// spellings that mean one of the above
const ALIAS = { none: 'linear', easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out' };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const HALF_PI = Math.PI / 2, TAU = Math.PI * 2;
const bad = (msg) => { throw new TypeError(`ease: ${msg}`); };

// A function of p with its ends pinned and a `maxUpTo`: the largest value over [0, p], sampled (the exact
// analytic version stays with the bezier). `extra` is copied onto it.
const SAMPLES = 512;
function finish(fn, extra) {
  const f = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : fn(p));
  f.maxUpTo = (p) => {
    if (!(p > 0)) return 0;
    const q = Math.min(1, p);
    let m = 0;
    for (let i = 1; i <= SAMPLES; i++) m = Math.max(m, f((q * i) / SAMPLES));
    return m;
  };
  return extra ? Object.assign(f, extra) : f;
}

// ------------------------------------------------------------------ the families (the "in" form of each)

const num = (v, name, lo = -Infinity) => { if (!(Number.isFinite(v) && v >= lo)) bad(`${name} must be a number${lo > -Infinity ? ` >= ${lo}` : ''}, got ${v}`); return v; };

/** bounce, in: the mirror of the Penner out-bounce (three landings, the first on p = 1 - 1/2.75). */
function bounceIn(t) {
  let pow2, b = 4;
  while (t < ((pow2 = 2 ** --b) - 1) / 11);
  return 1 / 4 ** (3 - b) - 7.5625 * ((pow2 * 3 - 2) / 22 - t) ** 2;
}

const IN = {
  power: (n = 2) => { num(n, 'power', 1e-6); return (p) => p ** n; },
  quad: () => (p) => p * p,
  cubic: () => (p) => p * p * p,
  quart: () => (p) => p ** 4,
  quint: () => (p) => p ** 5,
  sine: () => (p) => 1 - Math.cos(p * HALF_PI),
  circ: () => (p) => 1 - Math.sqrt(1 - p * p),
  expo: () => (p) => 2 ** (10 * p - 10),
  back: (s = 1.70158) => { num(s, 'back overshoot', 0); return (p) => (s + 1) * p * p * p - s * p * p; },
  elastic: (amp = 1, per = 0.3) => {
    const a = clamp(num(amp, 'elastic amplitude'), 1, 10), p0 = clamp(num(per, 'elastic period'), 1e-3, 2);
    const s = (p0 / TAU) * Math.asin(1 / a), k = TAU / p0;
    return (p) => -a * 2 ** (-10 * (1 - p)) * Math.sin((1 - p - s) * k);
  },
  bounce: () => bounceIn,
};

export const FAMILIES = Object.keys(IN);
const ARITY = { power: 1, back: 1, elastic: 2 };   // the params a family takes; the rest take none
export const TYPES = ['in', 'out', 'inOut', 'outIn'];

const DERIVE = {
  in: (f) => f,
  out: (f) => (p) => 1 - f(1 - p),
  inOut: (f) => (p) => (p < 0.5 ? f(2 * p) / 2 : 1 - f(2 - 2 * p) / 2),
  outIn: (f) => (p) => (p < 0.5 ? (1 - f(1 - 2 * p)) / 2 : (f(2 * p - 1) + 1) / 2),
};

/** The family `name` of the given `type` ('in' | 'out' | 'inOut' | 'outIn') with its params. */
export function easeFamily(name, type = 'out', ...args) {
  if (!Object.hasOwn(IN, name)) bad(`unknown family "${name}" (${FAMILIES.join(', ')})`);
  if (!TYPES.includes(type)) bad(`unknown type "${type}" (${TYPES.join(', ')})`);
  if (args.length > (ARITY[name] ?? 0)) bad(`${name} takes ${ARITY[name] ?? 0} argument(s), got ${args.length}`);
  const raw = IN[name](...args);
  const inward = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : raw(p));   // pinned, so the derived types meet at 0.5 exactly
  return finish(DERIVE[type](inward));
}

// ------------------------------------------------------------------ modifiers and the other shapes

/** 1 - f(1 - p): turns an in into an out. */
export const reverse = (f) => finish((p) => 1 - f(1 - p));
/** f(2p)/2 then the mirror: turns an in into an inOut. */
export const mirror = (f) => finish((p) => (p <= 0.5 ? f(2 * p) / 2 : (2 - f(2 * (1 - p))) / 2));

/** steps(n, direction): n jumps, at k/n from the end (default) or from the start; the last frame is 1. */
export function steps(n, direction = 'end') {
  if (!(Number.isFinite(n) && n >= 1)) bad(`steps needs a count of at least 1, got ${n}`);
  if (direction !== 'end' && direction !== 'start') bad(`steps direction must be start or end, got "${direction}"`);
  // a hair of slack, so p = 3/8 is on the third step whatever 0.375 * 8 rounds to
  return finish(direction === 'end' ? (p) => Math.floor(p * n + 1e-9) / n : (p) => Math.ceil(p * n - 1e-9) / n);
}

/** Piecewise linear through (xs[i], ys[i]); xs rises from 0 to 1. Flat past the ends. */
function piecewise(xs, ys, extra) {
  return finish((p) => {
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= p) lo = mid; else hi = mid; }
    const dx = xs[hi] - xs[lo];
    return dx > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (p - xs[lo])) / dx : ys[hi];
  }, { xs, ys, ...extra });
}

/**
 * irregular(n, randomness, seed): n points that rise unevenly from 0 to 1 (never down), joined by straight
 * lines. randomness 0 is linear, 1 is as uneven as it goes. The same seed gives the same cadence.
 */
export function irregular(n = 10, randomness = 1, seed = 0) {
  num(n, 'irregular count', 2); num(randomness, 'irregular randomness', 0);
  const rand = random(seed), total = Math.max(1, Math.floor(n) - 1);
  const ys = [0];
  for (let i = 1; i < total; i++) {
    const spacing = i / total, next = (i + 1) / total;
    const wild = spacing + (next - spacing) * rand();
    ys.push(clamp(spacing * (1 - randomness) + wild * randomness, ys[i - 1], 1));
  }
  ys.push(1);
  return piecewise(ys.map((_, i) => i / total), ys);
}

/**
 * slowMo(ratio, power): fast at both edges and slow in the middle. `ratio` is the share of the time spent in
 * the slow middle (0..0.95), `power` how slow it is (0 = no slowing, 1 = standing still). Each edge is a
 * parabola that meets the middle line without a kink.
 */
export function slowMo(ratio = 0.7, power = 0.7) {
  const r = clamp(num(ratio, 'slowMo ratio'), 0, 0.95), s = 1 - clamp(num(power, 'slowMo power'), 0, 1);
  const w = (1 - r) / 2, y1 = 0.5 - (s * r) / 2;
  const a = (s * w - y1) / (w * w), b = (2 * y1 - s * w) / w;
  return finish((p) => {
    if (p < w) return a * p * p + b * p;
    if (p > 1 - w) { const q = 1 - p; return 1 - (a * q * q + b * q); }
    return 0.5 + s * (p - 0.5);
  });
}

/**
 * expoScale(a, b, inner): the ease for a scale that goes from a to b: mixing a and b by it, a + (b - a) f(p), is
 * a * (b/a)^p, a zoom at a constant rate. `inner` (an ease, default linear) shapes the progress first.
 */
export function expoScale(a = 1, b = 2, inner = (p) => p) {
  if (!(a > 0 && b > 0 && a !== b)) bad(`expoScale needs two different scales above 0, got ${a} and ${b}`);
  const ratio = Math.log(b / a);
  return finish((p) => (a * Math.exp(ratio * inner(p)) - a) / (b - a));
}

/** bias(f, r): lean an ease. r in -1..1: above 0 it gets there sooner, below 0 later, 0 is f itself. */
export function bias(f, r = 0) {
  const y = 0.5 + clamp(num(r, 'bias'), -1, 1) / 2;
  return finish((p) => f(2 * (1 - p) * p * y + p * p));
}

// ------------------------------------------------------------------ CSS linear()

const PCT = /^(-?\d+(?:\.\d+)?|-?\.\d+)%$/;

/**
 * linear(...) as CSS reads it: { xs, ys }. A stop is a number and up to two percentages (two make a flat run).
 * The first stop with no position sits at 0 %, the last at 100 %; a position below the one before is raised to it;
 * stops with no position between two positioned ones are spread evenly.
 */
export function parseLinear(str) {
  const m = /^linear\(([\s\S]*)\)$/.exec(String(str).trim());
  if (!m) bad(`"${str}" is not linear(...)`);
  const stops = [];
  for (const part of splitArgs(m[1])) {
    const bits = part.trim().split(/\s+/);
    const y = Number(bits[0]);
    if (!Number.isFinite(y)) bad(`linear() stop "${part}" does not start with a number`);
    const at = bits.slice(1).map((b) => { const q = PCT.exec(b); if (!q) bad(`linear() stop "${part}" has "${b}" where a percentage should be`); return Number(q[1]) / 100; });
    if (at.length > 2) bad(`linear() stop "${part}" has more than two positions`);
    for (const x of at.length ? at : [null]) stops.push({ y, x });
  }
  if (stops.length < 2) bad('linear() needs at least two stops');
  if (stops[0].x === null) stops[0].x = 0;
  if (stops.at(-1).x === null) stops.at(-1).x = 1;
  let top = -Infinity;
  for (const s of stops) if (s.x !== null) { s.x = Math.max(s.x, top); top = s.x; }
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].x !== null) continue;
    let j = i;
    while (stops[j].x === null) j++;
    const a = stops[i - 1].x, b = stops[j].x;
    for (let k = i; k < j; k++) stops[k].x = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return { xs: stops.map((s) => s.x), ys: stops.map((s) => s.y) };
}

// ------------------------------------------------------------------ the grammar

// split on commas outside parentheses and quotes
function splitArgs(s) {
  const out = [];
  let depth = 0, q = null, at = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(at, i).trim()); at = i + 1; }
  }
  const tail = s.slice(at).trim();
  if (tail || out.length) out.push(tail);
  return out;
}

const BEZIER = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;
const CALL = /^([A-Za-z][A-Za-z0-9]*)(?:\.([A-Za-z]+))?(?:\(([\s\S]*)\))?$/;
const CAMEL = /^(inOut|outIn|in|out)([A-Z][A-Za-z0-9]*)$/;
const cache = new Map();

function build(key, raw) {
  const kw = KEYWORDS[ALIAS[key] ?? key];
  if (kw) return cubicBezier(...kw);
  const bz = BEZIER.exec(key);
  if (bz) return cubicBezier(...bz.slice(1).map(Number));
  if (/^linear\(/.test(key)) { const { xs, ys } = parseLinear(key); return piecewise(xs, ys); }
  const m = CALL.exec(key);
  if (!m) bad(`unknown easing "${raw}"`);
  let [, name, type, argText] = m;
  const args = argText == null ? [] : splitArgs(argText);
  const n = () => args.map((a) => { const v = Number(a); if (a === '' || !Number.isFinite(v)) bad(`"${a}" is not a number in "${raw}"`); return v; });
  const sub = (i) => { if (args[i] == null || args[i] === '') bad(`"${raw}" needs an ease as argument ${i + 1}`); return parseEasing(args[i]); };
  if (type == null) { const c = CAMEL.exec(name); if (c) { const fam = c[2][0].toLowerCase() + c[2].slice(1); if (Object.hasOwn(IN, fam)) { name = fam; type = c[1]; } } }
  if (Object.hasOwn(IN, name)) return easeFamily(name, type ?? 'out', ...n());
  if (type != null) bad(`unknown easing "${raw}"`);
  switch (name) {
    case 'steps': {
      if (!args.length) bad(`steps needs a count in "${raw}"`);
      return steps(Number(args[0]), args[1] ?? 'end');
    }
    case 'irregular': return irregular(...n());
    case 'slowMo': return slowMo(...n());
    case 'expoScale': {
      const [a, b] = [Number(args[0]), Number(args[1])];
      return expoScale(a, b, args[2] ? parseEasing(args[2]) : undefined);
    }
    case 'bias': { const r = Number(args[1]); if (args.length !== 2 || !Number.isFinite(r)) bad(`bias takes an ease and a number in "${raw}"`); return bias(sub(0), r); }
    case 'reverse': return reverse(sub(0));
    case 'mirror': return mirror(sub(0));
    case 'anticipate': return finish((p) => ((p *= 2) < 1 ? 0.5 * IN.back(1.70158)(p) : 0.5 * (2 - 2 ** (-10 * (p - 1)))));
    case 'curve': { if (!argText?.trim()) bad(`curve needs path data or numbers in "${raw}"`); return curve(argText); }
    default: return bad(`unknown easing "${raw}"`);
  }
}

export function parseEasing(str) {
  const key = String(str).trim();
  if (cache.has(key)) return cache.get(key);
  const f = build(key, str);
  cache.set(key, f);
  return f;
}

function resolve(name, style) {
  const roles = style?.motion?.easings;
  return parseEasing(roles && roles[name] ? roles[name] : name);
}

export function ease(name, p, style) {
  return resolve(name, style)(p);
}

// Overshoot so far: max(0, max eased value over [0, p] − 1).
ease.overshoot = function overshoot(name, p, style) {
  return Math.max(0, resolve(name, style).maxUpTo(p) - 1);
};

// ------------------------------------------------------------------ what the gate and the exporters ask

/**
 * What is wrong with an ease string, as [{ kind, message }]: 'unknown' (it does not parse), 'steps-last' (a steps
 * count that is not a whole number, so the last step is partial), 'curve-backward' / 'curve-flat' (a custom curve
 * that is not a function of x), 'ends' (it does not start at 0 or end at 1 as written). An ease that is fine gives [].
 */
export function easeIssues(str) {
  const key = String(str).trim();
  let f;
  try { f = parseEasing(key); } catch (e) { return [{ kind: 'unknown', message: e.message.replace(/^ease: /, '') }]; }
  const out = [];
  const st = /^steps\(\s*([^,)]*)/.exec(key);
  if (st && !Number.isInteger(Number(st[1]))) out.push({ kind: 'steps-last', message: `steps(${st[1].trim()}) is not a whole number of steps, so the last step is partial; the last frame is pinned to 1 but arrives early` });
  if (f.issues) out.push(...f.issues);
  if (/^linear\(/.test(key)) {
    const { xs, ys } = parseLinear(key);
    if (Math.abs(ys[0]) > 1e-9 || Math.abs(ys.at(-1) - 1) > 1e-9 || xs[0] !== 0 || xs.at(-1) !== 1) out.push({ kind: 'ends', message: `linear() starts at ${ys[0]} and ends at ${ys.at(-1)}; an ease starts at 0 and ends at 1, and the kit pins both` });
  }
  return out;
}

/** The four numbers of a cubic bezier ease (a keyword or cubic-bezier(...)), else null: the ease has no bezier form. */
export function bezierPoints(str) {
  const key = String(str).trim();
  const kw = KEYWORDS[ALIAS[key] ?? key];
  if (kw) return [...kw];
  const m = BEZIER.exec(key);
  return m ? m.slice(1).map(Number) : null;
}

const round = (v, d) => { const k = 10 ** d; const r = Math.round(v * k) / k; return Object.is(r, -0) ? 0 : r; };

/**
 * A CSS `linear(...)` for f over 0..1: split where the curve bends away from a straight line by more than `tol`
 * (so a vertical tangent gets the points it needs and a straight run gets two), y to 4 decimals, x as a
 * percentage to 3. Every kept point carries its position, so a reader needs no spreading rule.
 */
export function toLinear(f, { tol = 0.0015, start = 64 } = {}) {
  const pts = [[0, f(0)]];
  const span = (a, b, fa, fb) => {
    let worst = 0;
    for (let k = 1; k <= 5; k++) worst = Math.max(worst, Math.abs(f(a + ((b - a) * k) / 6) - (fa + ((fb - fa) * k) / 6)));
    if (worst > tol && b - a > 2e-5) {
      const m = (a + b) / 2, fm = f(m);
      span(a, m, fa, fm); pts.push([m, fm]); span(m, b, fm, fb);
    }
  };
  for (let i = 0; i < start; i++) {
    const a = i / start, b = (i + 1) / start, fa = f(a), fb = f(b);
    span(a, b, fa, fb);
    pts.push([b, fb]);
  }
  // drop the points that lie on the line between their neighbours, within tol
  const kept = [pts[0]];
  for (let i = 0; i < pts.length - 1;) {
    let best = i + 1;
    for (let k = i + 2; k < pts.length; k++) {
      const [ax, ay] = pts[i], [bx, by] = pts[k];
      let ok = true;
      for (let q = i + 1; q < k && ok; q++) ok = Math.abs(pts[q][1] - (ay + ((by - ay) * (pts[q][0] - ax)) / (bx - ax))) <= tol;
      if (!ok) break;
      best = k;
    }
    kept.push(pts[best]);
    i = best;
  }
  const stops = kept.map(([x, y], i) => {
    const v = round(y, 4);
    return i === 0 || i === kept.length - 1 ? String(v) : `${v} ${round(x * 100, 3)}%`;
  });
  return `linear(${stops.join(', ')})`;
}

/**
 * The CSS easing for an ease string and whether it is exact: keywords and cubic-bezier stay as written, steps(n)
 * becomes steps(n, jump-end|jump-start), everything else is a sampled linear().
 */
export function cssEasing(str, opts) {
  const key = String(str).trim();
  if (KEYWORDS[key]) return { css: key, exact: true };
  if (ALIAS[key]) return { css: ALIAS[key], exact: true };
  if (/^cubic-bezier\(/.test(key)) { parseEasing(key); return { css: key, exact: true }; }
  const st = /^steps\(\s*(\d+)\s*(?:,\s*(start|end)\s*)?\)$/.exec(key);
  if (st) { parseEasing(key); return { css: `steps(${st[1]}, jump-${st[2] ?? 'end'})`, exact: true }; }
  return { css: toLinear(parseEasing(key), opts), exact: false };
}

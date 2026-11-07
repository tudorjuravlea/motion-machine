// data/unit-stack: a figure built from countable plates. One plate is one stated unit
// (`unit`); a value that is not a multiple ends on a part plate. Plates stack in columns of `per`,
// drawn as oblique boxes in palette roles, every `ruler`-th plate in the accent. Plate k lands at
// fall + (d − fall)·((k + 1)/n)^0.85, so the cascade speeds up as the stack rises and the last plate
// lands at the end of the entrance; each one is set down from above over `fall` seconds with a
// quintic ease, turning a few degrees as it settles. The figure shown is the landed plates times
// the unit (min with the value), never a roll on the clock, so it reaches the fact's value exactly
// as the last plate lands. More than 100 plates take a coarser 1-2-5 unit, and the rule line under
// the stack always states what one plate is. Timing reads the beat's own seconds (ctx.u), so a deck
// rest (u = Infinity) shows the finished stack. Plates are aria-hidden boxes with no text; the
// figure and the rule are DOM text; the figure's prefix and suffix show only on the finished stack.
// With no `fix`, the figure keeps the value's own decimals (and the unit's), so it rests on the
// exact fact; a figure of five or more digits is grouped in threes with a narrow no-break space. A
// value of zero or below has nothing to stack: the figure shows it and mm.warnings says so.
import { count, formatNumber } from '../../../runtime/kit/count.js';
import { random, hash } from '../../../runtime/kit/random.js';
import { safeArea } from '../../../runtime/kit/room.js';
import { selectorOf } from '../../../runtime/kit/schedule.js';

const SIZES = ['display', 'h1', 'h2'];
const MAX = 100;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  unit: { type: 'number', default: 1, meaning: 'what one plate stands for, in the figure\'s own units; above 100 plates a coarser 1-2-5 unit is used and stated' },
  per: { type: 'number', default: 10, meaning: 'plates per column, 4 to 20; further plates start a new column to the right' },
  ruler: { type: 'number', default: 10, meaning: 'every n-th plate is drawn in the accent, a ruler to count by; 0 for none' },
  rule: { type: 'string', default: '', meaning: 'the line under the stack that states the unit; empty writes "<unit> each" with the prefix and suffix' },
  fix: { type: 'number', default: null, meaning: 'decimal places of the figure; unset keeps the value\'s own decimals and the unit\'s, up to 4' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure (and after the unit in the rule line)' },
  size: { type: 'enum(display|h1|h2)', default: 'h1', meaning: 'the style size role of the figure' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/** The unit to use: `unit` when the value takes at most 100 plates, else the next 1-2-5 step that does. */
export function niceUnit(unit, value) {
  if (value / unit <= MAX) return unit;
  const need = value / MAX;
  let mag = 10 ** Math.floor(Math.log10(need));
  for (;;) {
    for (const m of [1, 2, 5]) if (m * mag >= need - 1e-9) return m * mag;
    mag *= 10;
  }
}

/** The plates for a value: count, unit, the last plate's share, the landing seconds over an entrance of d. */
export function plan(value, { unit = 1, d = 1.2 } = {}) {
  const u0 = unit > 0 && Number.isFinite(unit) ? unit : 1;
  if (!(value > 0) || !(d > 0)) return { value, unit: u0, n: 0, frac: 0, fall: 0, lands: [], coarsened: false };
  const u1 = niceUnit(u0, value);
  const n = Math.max(1, Math.ceil(value / u1 - 1e-9));
  const frac = clamp(value / u1 - (n - 1), 0, 1);
  const fall = Math.min(0.42, d * 0.35);
  const lands = Array.from({ length: n }, (_, k) => fall + (d - fall) * ((k + 1) / n) ** 0.85);
  return { value, unit: u1, n, frac, fall, lands, coarsened: u1 !== u0 };
}
/** The decimal places a number is written with (float noise ignored), at most 4. */
export function decimalsOf(x) {
  if (!Number.isFinite(x)) return 0;
  for (let k = 0; k < 4; k++) if (Math.abs(Math.round(x * 10 ** k) / 10 ** k - x) <= 1e-9 * Math.max(1, Math.abs(x))) return k;
  return 4;
}
/** The figure's decimal places: an explicit fix (0 to 4), else the value's own and the unit's. */
export function figureFix(value, unit, fix = null) {
  const f = fix === '' || fix == null ? NaN : Number(fix);
  if (Number.isFinite(f)) return clamp(Math.round(f), 0, 4);
  return Math.max(decimalsOf(value), decimalsOf(unit));
}
/** A written number with its integer part grouped in threes by a narrow no-break space, from five digits. */
export function groupDigits(text) {
  return String(text).replace(/^(-?)(\d{5,})/, (_, sign, int) => sign + int.replace(/\B(?=(\d{3})+$)/g, '\u202f'));
}

/** How many plates have landed at second u of the entrance. */
export const landedAt = (p, u) => { let k = 0; while (k < p.n && p.lands[k] <= u) k++; return k; };
/** The figure shown at second u: the landed plates times the unit, never past the value. */
export const shownAt = (p, u) => Math.min(landedAt(p, u) * p.unit, p.value);

// relative luminance of a #rgb / #rrggbb role, for choosing which roles light and shade the plates
function lum(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return 0.5;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const f = (i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}

export default {
  name: 'unit-stack',
  group: 'data',
  dur: 2.4,   // seconds: a stack needs time to read as built, whatever the style's roles; a beat's dur wins
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const value = num(el.dataset.value, 0);
    const d = num(ctx?.d, 2.4);
    const u = ctx?.u === Infinity ? Infinity : num(ctx?.u, clamp(p, 0, 1) * d);
    const P = plan(value, { unit: num(prm.unit, 1), d });
    const explicit = Number.isFinite(Number(prm.fix)) && prm.fix !== '' && prm.fix != null;
    const fmt = { fix: figureFix(value, P.unit, prm.fix), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') };
    if (!(value > 0)) {
      const w = doc.defaultView?.mm?.warnings, msg = `${selectorOf(ctx?.scene, el.dataset.slot)}: data/unit-stack value ${formatNumber(value, fmt)} is not above zero: nothing to stack, the figure shows the value with no plates`;
      if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
    }
    const per = clamp(Math.round(num(prm.per, 10)), 4, 20);
    const ruler = Math.max(0, Math.round(num(prm.ruler, 10)));
    const size = SIZES.includes(prm.size) ? prm.size : 'h1';

    // which roles light and shade: the lighter of ink and canvas lights the top, the darker shades the sides
    const c = ctx?.style?.color ?? {};
    const [light, dark] = lum(c.ink) > lum(c.canvas) ? ['ink', 'canvas'] : ['canvas', 'ink'];
    el.classList.add('mm-unit-stack');
    el.textContent = '';
    el.style.setProperty('--mm-us-light', `var(--mm-color-${light})`);
    el.style.setProperty('--mm-us-dark', `var(--mm-color-${dark})`);

    const k = landedAt(P, u);
    el.dataset.landed = String(k);
    el.dataset.plates = String(P.n);
    const figure = doc.createElement('span');
    figure.className = 'mm-unit-stack__figure';
    figure.style.fontSize = `var(--mm-size-${size})`;
    // the prefix and suffix keep their place but show only once every plate has landed, as data/counter
    const shown = shownAt(P, u);
    const full = count(figure, shown, shown, k < P.n ? 0.5 : 1, { ...fmt, hold: true });
    // group a long figure: the bare number (while the prefix and suffix are held) or the whole text
    const bare = formatNumber(shown, { fix: fmt.fix }), nice = groupDigits(bare);
    if (nice !== bare) for (const t of figure.childNodes) if (t.nodeType === 3) t.textContent = t.textContent === bare ? nice : t.textContent === full ? fmt.prefix + nice + fmt.suffix : t.textContent;

    // geometry from the slot's laid-out width (offsets, so no transform feeds back)
    const cols = Math.max(1, Math.ceil(P.n / per));
    const unitPx = num(ctx?.unit, 150);
    const avail = el.clientWidth || unitPx * 6;
    const gapX = unitPx * 0.18;
    // the stack takes at most a fifth of the safe height, so a figure, a stack and a headline fit
    const area = safeArea(el);
    const tall = area ? (area.y1 - area.y0) * 0.2 / (per * 0.152 + 0.3) : Infinity;
    const plateW = Math.min(unitPx * 1.5, tall, (avail - (cols - 1) * gapX) / cols / 1.25);
    const T = plateW * 0.14, D = plateW * 0.3, gap = Math.max(1, plateW * 0.012);
    const stage = doc.createElement('div');
    stage.className = 'mm-unit-stack__stage';
    stage.setAttribute('aria-hidden', 'true');
    const H = per * (T + gap) + D;
    stage.style.width = `${(cols * plateW + (cols - 1) * gapX + D).toFixed(2)}px`;
    stage.style.height = `${H.toFixed(2)}px`;
    stage.style.setProperty('--mm-us-depth', `${D.toFixed(2)}px`);
    const next = random(hash(`unit-stack:${value}:${P.unit}`));
    for (let i = 0; i < P.n; i++) {
      // seeded per plate, drawn in order so every plate keeps its look whatever has landed
      const jx = (next() - 0.5) * plateW * 0.03, rot = (next() - 0.5) * 1.0, shade = next() * 0.11 - 0.07, spin = (next() < 0.5 ? -1 : 1) * (3 + next() * 3);
      const start = P.lands[i] - P.fall;
      if (!(u >= start)) continue;
      const x = clamp((u - start) / P.fall, 0, 1);
      const f = (1 - x) ** 5;   // quintic: set down from above, slowing into the stack
      const col = Math.floor(i / per), lvl = i % per;
      const h = i === P.n - 1 ? T * P.frac : T;
      const plate = doc.createElement('i');
      plate.className = 'mm-unit-stack__plate';
      if (ruler && (i + 1) % ruler === 0) plate.dataset.ruler = '';
      if (P.lands[i] <= u) plate.dataset.landed = '';
      plate.style.left = `${(col * (plateW + gapX) + jx).toFixed(2)}px`;
      plate.style.bottom = `${(lvl * (T + gap) + f * T * 4).toFixed(2)}px`;
      plate.style.width = `${plateW.toFixed(2)}px`;
      plate.style.height = `${h.toFixed(2)}px`;
      plate.style.rotate = `${(rot + spin * f).toFixed(3)}deg`;
      plate.style.opacity = String(Number(clamp(x * 3, 0, 1).toFixed(4)));
      plate.style.setProperty('--mm-us-shade', `${Math.abs(shade * 100).toFixed(2)}%`);
      plate.style.setProperty('--mm-us-toward', shade < 0 ? 'var(--mm-us-dark)' : 'var(--mm-us-light)');
      stage.append(plate);
    }

    const rule = doc.createElement('span');
    rule.className = 'mm-unit-stack__rule';
    const stated = String(prm.rule ?? '').trim();
    const ruleFix = Math.max(explicit ? fmt.fix : 0, decimalsOf(P.unit));
    rule.textContent = stated && !P.coarsened ? stated : `${fmt.prefix}${groupDigits(formatNumber(P.unit, { fix: ruleFix }))}${fmt.suffix} each`;
    el.append(figure, stage, rule);
  },
};

// entrances/power-on: a screen switching on. A bright line scales across the slot, opens vertically
// into the content (which starts brighter than it rests), then the content flickers in a few held
// frames while a colour split jitters and settles. Every step is held: the frame that shows is the
// last step boundary at or before the instant, chosen from a fixed integer hash, so the same instant
// always gives the same picture and nothing is carried between frames.
// Writes a line element inside the slot and style on the slot (visibility, clip-path, opacity, filter,
// a relative position); a seek restores them, and at p = 1 nothing is written.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r2 = (x) => String(Math.round(x * 100) / 100);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const LINE = 0.2, OPEN = 0.45, JITTER = 4;   // the line ends at LINE, the opening at OPEN; at least JITTER settling steps

const params = {
  flicker: { type: 'number', default: 3, meaning: 'how many dips the content flickers through after it opens, 0 to 8; 0 opens straight to rest' },
  split: { type: 'number', default: 6, meaning: 'how far the colour split jitters at first, in px, 0 to 24; 0 turns the split off' },
  tone: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the palette role of the line, its glow and the first ghost of the split' },
  weight: { type: 'number', default: 0.006, meaning: 'thickness of the line, as a share of the frame\'s short side, 0.002 to 0.03' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) && v !== '' && v != null ? n : d)); };

// A hash of an integer to [0, 1): the held frames' dice, the same everywhere.
function hash(a) {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(a + 17, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The state at the entrance's linear progress q, from its parameters: `line` (how far the line has
 * crossed, 0 to 1, or null once it is gone), `open` (how far the content has opened, 0 to 1),
 * `opacity` (the held flicker level), `dx`, `dy` (the ghost offset in px) and `frame` (which held
 * flicker step, -1 outside them). Pure.
 */
export function stateAt(q, prm = {}) {
  const p = { ...DEFAULTS, ...prm };
  const n = Math.round(num(p.flicker, DEFAULTS.flicker, 0, 8)), s = num(p.split, DEFAULTS.split, 0, 24);
  if (q >= 1) return { line: null, open: 1, opacity: 1, dx: 0, dy: 0, frame: -1 };
  if (q < LINE) return { line: clamp01(q / LINE), open: 0, opacity: 1, dx: 0, dy: 0, frame: -1 };
  const F = 2 * n + 1, J = Math.max(F, JITTER);
  const r = clamp01((q - OPEN) / (1 - OPEN));
  const k = q < OPEN ? 0 : Math.min(F - 1, Math.floor(r * F));
  const j = q < OPEN ? 0 : Math.min(J - 1, Math.floor(r * J));
  const opacity = k === F - 1 ? 1 : k % 2 === 1 ? 0.3 + 0.35 * hash(k) : 0.85 + 0.15 * hash(k);
  const amp = s * (q < OPEN ? 1 : 1 - j / (J - 1));
  const sign = hash(j + 40) > 0.5 ? 1 : -1;
  return { line: q < OPEN ? 1 : null, open: q < OPEN ? clamp01((q - LINE) / (OPEN - LINE)) : 1, opacity, dx: sign * amp, dy: (hash(j + 80) - 0.5) * amp * 0.4, frame: k };
}

export default {
  name: 'power-on',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const q = p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q >= 1) return;
    const prm = { ...DEFAULTS, ...ctx.params };
    const tone = prm.tone === 'ink' ? 'ink' : 'accent';
    const travel = ctx.style?.motion?.travel ?? 1;
    const st = stateAt(q, { ...prm, split: num(prm.split, DEFAULTS.split, 0, 24) * travel });
    const doc = el.ownerDocument;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    if (st.line != null) {
      const bar = doc.createElement('span');
      bar.className = 'mm-power-on__line';
      bar.setAttribute('aria-hidden', 'true');
      bar.style.setProperty('--mm-po-tone', `var(--mm-color-${tone})`);
      bar.style.setProperty('--mm-po-weight', r3(num(prm.weight, DEFAULTS.weight, 0.002, 0.03)));
      bar.style.scale = `${r3(ctx.ease ? ctx.ease('move', st.line) : st.line)} 1`;
      if (st.open > 0) bar.style.opacity = r3(1 - st.open);
      el.append(bar);
    }
    if (st.open <= 0) { el.style.visibility = 'hidden'; return; }
    if (st.open < 1) {
      const o = ctx.ease ? ctx.ease('move', st.open) : st.open;
      const edge = `calc(${r2(50 * (1 - o))}% - ${r3(0.5 * o)}em)`;
      el.style.clipPath = `inset(${edge} -0.5em ${edge} -0.5em)`;
      el.style.filter = `brightness(${r2(1 + 1.2 * (1 - o))})`;
    }
    if (st.opacity < 1) el.style.opacity = r2(st.opacity);
    if (Math.abs(st.dx) > 0.05 || Math.abs(st.dy) > 0.05) {
      const ghost = (role, a, x, y) => `drop-shadow(${r2(x)}px ${r2(y)}px 0 color-mix(in srgb, var(--mm-color-${role}) ${a}%, transparent))`;
      const split = `${ghost(tone, 70, -st.dx, -st.dy)} ${ghost('muted', 60, st.dx, st.dy)}`;
      el.style.filter = el.style.filter ? `${el.style.filter} ${split}` : split;
    }
  },
};

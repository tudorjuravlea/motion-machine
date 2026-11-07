// transitions/dissolve-edge: a noise-field dissolve whose moving edge glows. A seeded turbulence field
// (the same in every render: the seed comes from the scene) is read as a height; the incoming scene is
// revealed wherever the field lies under a level that rises with the cut, and a band just outside the
// reveal, where the field is a little above the level, burns in a palette role and fades outward. The
// outgoing scene stays whole underneath, so every pixel shows one scene except the few the edge
// itself covers. One SVG filter on the incoming section does it all (a turbulence primitive, a
// threshold per ramp, a flood of the role); the kit removes the filter's node on every seek.
import { hash } from '../../../runtime/kit/random.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const r4 = (x) => String(Math.round(x * 1e4) / 1e4);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const OWN = ['filter'];
const FILTER_ID = 'mm-tx-dissolve';
const ROLES = ['accent', 'ink', 'canvas', 'surface', 'muted', 'line', 'accentInk'];

const params = {
  glow: { type: 'enum(accent|ink|canvas|surface|muted|line|accentInk)', default: 'accent', meaning: 'the palette role the moving edge glows in' },
  width: { type: 'number', default: 0.08, meaning: 'the glow band\'s width as a share of the field\'s range, 0.02 to 0.3: wider is a longer, softer burn' },
  scale: { type: 'number', default: 0.3, meaning: 'the size of the field\'s features as a share of the frame\'s short side, 0.1 to 1: smaller is finer' },
  detail: { type: 'number', default: 3, meaning: 'the octaves of the field, 1 to 5: 1 is smooth blobs, 5 a craggy edge' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

const GAIN = 2.2, BIAS = -0.6;   // the field's red channel (about 0.27 to 0.73) stretched to 0 to 1 in the alpha it is read from
const SOFT = 0.012;              // how sharp the reveal's own edge is, in the field's range: about two px

/** The level at which 0, 10, ... 100 % of the field lies under it (measured on the field this filter draws, over seeds, scales and octaves), in the field's 0 to 1 range. */
export const KNOTS = [0, 0.17, 0.29, 0.38, 0.45, 0.52, 0.59, 0.67, 0.76, 0.88, 1.01];

/**
 * The level the reveal has reached at linear progress q (0 to 1), so that the area revealed is about q;
 * the glow band (the width above it) is held off the field until the cut begins and gone when it ends.
 */
export function levelOf(q, width) {
  q = clamp01(q);
  const x = q * (KNOTS.length - 1), i = Math.min(KNOTS.length - 2, Math.floor(x));
  const k = KNOTS[i] + (KNOTS[i + 1] - KNOTS[i]) * (x - i);
  return k - width * (1 - q);
}

/** How much of its glow the edge burns at progress q: it kindles over the first tenth of the cut and dies over the last, so no remnant outlives the reveal. */
export function burnOf(q) { return clamp01(Math.min(q, 1 - q) / BURN_RAMP); }
const BURN_RAMP = 0.1;

/**
 * The filter (a string) for a w x h section: a field of `freq` (cycles per px) and `octaves`, seeded;
 * revealed where it lies under `level`; the band `width` above it glows in `glow` (a hex colour), at
 * `burn` (0 to 1) of its strength.
 */
export function markup({ id = FILTER_ID, w, h, seed, freq, octaves, level, width, glow, burn = 1 }) {
  const K = 1 / SOFT, Ko = 1 / width;
  return `<filter id="${id}" x="0" y="0" width="${r4(w)}" height="${r4(h)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${r4(freq)}" numOctaves="${octaves}" seed="${seed}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${GAIN} 0 0 0 ${BIAS}" result="nz"/>`
    + `<feComponentTransfer in="nz" result="in"><feFuncA type="linear" slope="${r4(-K)}" intercept="${r4(K * level)}"/></feComponentTransfer>`
    + `<feComponentTransfer in="nz" result="out"><feFuncA type="linear" slope="${r4(-Ko)}" intercept="${r4(Ko * (level + width))}"/></feComponentTransfer>`
    + `<feComposite in="out" in2="in" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="band"/>`
    + `<feComponentTransfer in="band" result="edge"><feFuncA type="gamma" amplitude="${r4(burn)}" exponent="1.6" offset="0"/></feComponentTransfer>`
    + `<feFlood flood-color="${glow}" result="gc"/>`
    + `<feComposite in="gc" in2="edge" operator="in" result="glow"/>`
    + `<feComposite in="SourceGraphic" in2="in" operator="in" result="rev"/>`
    + `<feMerge><feMergeNode in="rev"/><feMergeNode in="glow"/></feMerge></filter>`;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'dissolve-edge',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const doc = to.ownerDocument;
    const prm = { ...DEFAULTS, ...ctx.params };
    const d = Number(ctx.d) > 0 ? Number(ctx.d) : 1;
    const q = Number.isFinite(ctx.u) ? ctx.u / d : p;
    const w = to.offsetWidth || 1080, h = to.offsetHeight || 1920, short = Math.min(w, h);
    const role = ROLES.includes(prm.glow) ? prm.glow : DEFAULTS.glow;
    const glow = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue(`--mm-color-${role}`).trim();
    if (!glow) return;
    const width = clamp(num(prm.width, DEFAULTS.width), 0.02, 0.3);
    const holder = doc.createElement('div');
    // parsed as HTML so the SVG namespace needs no URL in the runtime (SPEC §2.6)
    holder.innerHTML = '<svg aria-hidden="true" width="0" height="0" style="position:absolute" data-mm-overlay></svg>';
    const svg = holder.firstElementChild;
    svg.innerHTML = markup({
      w, h, seed: 1 + (hash(String(ctx.scene ?? to.dataset?.scene ?? '')) % 9973),
      freq: 1 / (clamp(num(prm.scale, DEFAULTS.scale), 0.1, 1) * short),
      octaves: Math.round(clamp(num(prm.detail, DEFAULTS.detail), 1, 5)), level: levelOf(q, width), width, glow, burn: burnOf(q),
    });
    to.parentNode.append(svg);
    to.style.filter = `url(#${FILTER_ID})`;
  },
};

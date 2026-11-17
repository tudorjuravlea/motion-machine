// transitions/glitch: a cut that breaks up for a moment. Horizontal bands of the picture slip sideways
// (an SVG displacement whose band pattern is seeded noise quantised into a few steps, reseeded on a
// stepped clock), growing toward the middle of the cut, where the two scenes stutter (one or two single
// frames of the other scene), then dying out, so the incoming scene rests exactly as itself. Only one
// scene is drawn in any frame, so no type is exposed twice, and the stutters are capped well under the
// flash rate QA-FLASH allows. An opt-in tech look: no preset uses it. Pure in the cut's time and a seed
// taken from the scene.
// The seeded glitch burst follows pmndrs/postprocessing's glitch effect (Zlib); no code taken.
import { random, hash } from '../../../runtime/kit/random.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const OWN = ['filter', 'opacity', 'visibility'];
const FILTER_ID = 'mm-tx-glitch';
const STEPS_PER_S = 24, SLIP = 0.06, STUTTERS = 2;   // the clock the bands jump on; the largest slip as a share of the width; the most single-frame swaps

const params = {
  strength: { type: 'number', default: 0.6, meaning: 'how hard it breaks up, 0 to 1: the bands slip up to 6 % of the frame\'s width at 1' },
  bands: { type: 'number', default: 14, meaning: 'how many horizontal bands across the frame, 4 to 40' },
  stutter: { type: 'enum(true|false)', default: 'true', meaning: 'whether the two scenes swap for a single frame once or twice around the middle of the cut' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/**
 * The picture at linear progress q through the cut (d seconds): which scene shows (`shows`: from or
 * to), the slip in px (`slip`, 0 when the picture is whole) and the band pattern's seed (`seed`).
 */
export function frameAt(q, prm, { d, width, seed }) {
  q = clamp01(q);
  const strength = clamp01(num(prm.strength, DEFAULTS.strength));
  const env = Math.sin(Math.PI * clamp01(q / 0.9));   // grows to the middle, gone by 90 % of the cut
  const step = Math.floor(q * d * STEPS_PER_S);
  let shows = q < 0.5 ? 'from' : 'to';
  if (String(prm.stutter ?? DEFAULTS.stutter) !== 'false') {
    // up to STUTTERS single frames of the other scene, at seeded steps inside the middle of the cut
    const rnd = random((seed ^ 0x51ed27) >>> 0), first = Math.floor(d * STEPS_PER_S * 0.5);
    const at = [first - 2 - Math.floor(rnd() * 2), first + 1 + Math.floor(rnd() * 2)].slice(0, STUTTERS);
    if (at.includes(step)) shows = shows === 'from' ? 'to' : 'from';
  }
  return { shows, slip: SLIP * width * strength * env, seed: (hash(`${seed}:${step}`) % 9973) + 1 };
}

function filterNode(doc, { w, h, slip, seed, bands }) {
  const holder = doc.createElement('div');
  holder.innerHTML = '<svg aria-hidden="true" width="0" height="0" style="position:absolute" data-mm-overlay></svg>';
  const svg = holder.firstElementChild;
  // the bands: noise with almost no variation across x, quantised into steps; most bands stay put (0.5), some slip either way
  const table = '0.5 0.5 0.15 0.5 0.85 0.5 0.3 0.5 0.7 0.5';
  svg.innerHTML = `<filter id="${FILTER_ID}" x="0" y="0" width="${r3(w)}" height="${r3(h)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.00001 ${r3(bands / h)}" numOctaves="1" seed="${seed}" result="n"/>`
    + `<feComponentTransfer in="n" result="b"><feFuncR type="discrete" tableValues="${table}"/><feFuncG type="discrete" tableValues="0.5"/></feComponentTransfer>`
    + `<feDisplacementMap in="SourceGraphic" in2="b" scale="${r3(slip * 2)}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  return svg;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'glitch',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming, from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const d = Number(ctx.d) > 0 ? Number(ctx.d) : 0.5;
    const q = Number.isFinite(ctx.u) ? ctx.u / d : p;
    const doc = to.ownerDocument, w = to.offsetWidth || 1080, h = to.offsetHeight || 1920;
    const prm = { ...DEFAULTS, ...ctx.params };
    const f = frameAt(q, prm, { d, width: w, seed: hash(String(ctx.scene ?? to.dataset?.scene ?? '')) });
    const [shown, hidden] = f.shows === 'from' && from ? [from, to] : [to, from];
    if (hidden) { hidden.style.opacity = '0'; hidden.style.visibility = 'hidden'; }
    if (f.slip > 0.5 && doc) {
      to.parentNode.append(filterNode(doc, { w, h, slip: f.slip, seed: f.seed, bands: clamp(num(prm.bands, DEFAULTS.bands), 4, 40) }));
      shown.style.filter = `url(#${FILTER_ID})`;
    }
  },
};

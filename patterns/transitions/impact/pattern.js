// transitions/impact: a hit at the cut. The outgoing scene builds toward it (a small push-in and a
// rising colour fringe); at the hit the incoming scene replaces it, punched in a little too large,
// shaking, with the fringe at its peak; all three settle before the cut ends, so the incoming scene
// rests exactly as itself. Only one scene is drawn in any frame, so no type is ever exposed twice.
// Every part is a function of the cut's time and a seed taken from the scene: the shake is two sines
// per axis at unrelated frequencies with seeded phases, under a squared decay (the way moves/shake
// rings), and it never leaves more than the zoom margin, so the frame's edge is never exposed. The
// fringe is a lens's colour fringe in two palette roles (runtime/kit/lens.js): nothing at the middle,
// most at the edges.
import { random, hash } from '../../../runtime/kit/random.js';
import { fringeNode, warmRamp } from '../../../runtime/kit/lens.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const OWN = ['transform', 'filter', 'opacity', 'visibility'];
const FILTER_ID = 'mm-tx-impact';

const params = {
  strength: { type: 'number', default: 0.6, meaning: 'how hard the hit lands, 0 to 1: scales the zoom punch (12 % of the scene at 1), the shake and the fringe together' },
  shake: { type: 'number', default: 0.6, meaning: 'the decaying shake as a share of its full size (1.5 % of the short side at strength 1), 0 for none' },
  fringe: { type: 'number', default: 0.6, meaning: 'the radial colour fringe at the cut as a share of its full size (1.2 % of the short side apart at the frame\'s edge at strength 1), 0 for none' },
  hit: { type: 'number', default: 0.3, meaning: 'where in the cut the hit lands, as a share of its length, 0.15 to 0.6' },
  outer: { type: 'enum(accent|ink|muted|surface|line|accentInk)', default: 'accent', meaning: 'the palette role of the fringe pulled toward the frame\'s rim' },
  inner: { type: 'enum(accent|ink|muted|surface|line|accentInk)', default: 'muted', meaning: 'the palette role of the fringe pulled toward the middle' },
};
const ROLES = ['accent', 'ink', 'muted', 'surface', 'line', 'accentInk'];
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

const PUNCH = 0.12, BUILD = 0.5, SHAKE = 0.015, FRINGE = 0.012;   // the largest zoom, the share of it built before the hit, the shake and the fringe as shares of the short side
const FX = [97, 151], FY = [113, 173], WEIGHT = [0.62, 0.38];   // angular frequencies in rad/s: two per axis, none a multiple of another

/**
 * The picture at linear progress q (0 to 1) through the cut. `shows` is the one scene drawn, `scale`
 * its zoom, (`dx`, `dy`) its shake in px, `fringe` the fringe's share of its full size (0 to 1; 0
 * when it is off). o = { ease, d (the cut's seconds), short (the frame's short side, px), seed }.
 */
export function frameAt(q, prm, o) {
  const strength = clamp01(num(prm.strength, DEFAULTS.strength));
  const hit = clamp(num(prm.hit, DEFAULTS.hit), 0.15, 0.6);
  const shake = clamp01(num(prm.shake, DEFAULTS.shake)), fringe = clamp01(num(prm.fringe, DEFAULTS.fringe));
  const zoom = PUNCH * strength;
  q = clamp01(q);
  if (q < hit) {
    const a = q / hit;
    return { shows: 'from', scale: 1 + BUILD * zoom * a * a, dx: 0, dy: 0, fringe: fringe > 0 && strength > 0 ? a * a : 0 };
  }
  const b = (q - hit) / (1 - hit);
  const env = (1 - b) * (1 - b);
  const scale = 1 + zoom * (1 - o.ease('enter', b));
  const amp = Math.min(SHAKE * o.short * shake * strength * env, ((scale - 1) * o.short) / 2);
  const u = q * o.d;
  const next = random(Math.round(num(o.seed, 0)) + 0x1a9ac7);
  const ph = [next(), next(), next(), next()].map((r) => r * Math.PI * 2);
  const dx = amp * (WEIGHT[0] * Math.sin(FX[0] * u + ph[0]) + WEIGHT[1] * Math.sin(FX[1] * u + ph[1]));
  const dy = amp * (WEIGHT[0] * Math.sin(FY[0] * u + ph[2]) + WEIGHT[1] * Math.sin(FY[1] * u + ph[3]));
  return { shows: 'to', scale, dx: dx + 0, dy: dy + 0, fringe: fringe > 0 && strength > 0 ? env : 0 };
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'impact',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const d = Number(ctx.d) > 0 ? Number(ctx.d) : 0.3;
    const q = Number.isFinite(ctx.u) ? ctx.u / d : p;
    const doc = to.ownerDocument;
    const w = to.offsetWidth || 1080, h = to.offsetHeight || 1920, short = Math.min(w, h);
    const prm = { ...DEFAULTS, ...ctx.params };
    const f = frameAt(q, prm, { ease: ctx.ease ?? ((n, x) => x), d, short, seed: hash(String(ctx.scene ?? to.dataset?.scene ?? '')) });
    const [shown, hidden] = f.shows === 'from' && from ? [from, to] : [to, from];
    if (hidden) { hidden.style.opacity = '0'; hidden.style.visibility = 'hidden'; }
    shown.style.transform = `translate(${r3(f.dx)}px, ${r3(f.dy)}px) scale(${r3(f.scale)})`;
    const a = 2 * FRINGE * short * clamp01(num(prm.strength, DEFAULTS.strength)) * clamp01(num(prm.fringe, DEFAULTS.fringe)) * f.fringe;
    if (a > 0.2 && doc) {
      const cs = doc.defaultView.getComputedStyle(doc.documentElement);
      const role = (name, fallback) => cs.getPropertyValue(`--mm-color-${ROLES.includes(name) ? name : fallback}`).trim();
      const node = fringeNode(doc, { id: FILTER_ID, a, w, h, canvas: cs.getPropertyValue('--mm-color-canvas').trim(), outer: role(prm.outer, 'accent'), inner: role(prm.inner, 'muted') });
      if (node) {
        to.parentNode.append(node);
        shown.style.filter = `url(#${FILTER_ID})`;
        ctx.afterSettle?.(() => warmRamp());   // the ramp the filter reads is decoded before the frame is taken
      }
    }
  },
};


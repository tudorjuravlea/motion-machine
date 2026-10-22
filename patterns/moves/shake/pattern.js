// moves/shake: the camera jolts on an impact (a landing, a slam, a stamp) and calms to stillness.
// Each hit rings for `decay` seconds under a quadratic envelope (1 - elapsed / decay)², so it is
// sharp at the impact and fades without a tail. The path on each axis is two sines at unrelated
// frequencies with seeded phases, so it never judders along one diagonal. Pure in the scene's
// seconds (ctx.u): no state between seeks. The ring is shortened so it is over by the scene's rest
// (ctx.settle), and a hit at or after the rest is dropped, so the rest is a still frame. A deck never
// shakes. Writes only `translate` on .mm-camera, and nothing at all while it is still.
import { random } from '../../../runtime/kit/random.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const params = {
  hits: { type: 'string', default: '0.5', meaning: 'the impacts, in seconds from the scene\'s start, comma separated ("0.8" or "0.8, 2.4")' },
  amp: { type: 'number', default: 14, meaning: 'the largest offset on each axis at the impact, in px before the style\'s travel; 0 to 40' },
  decay: { type: 'number', default: 0.45, meaning: 'seconds each hit rings before it is still; 0.1 to 1.5' },
  seed: { type: 'number', default: 0, meaning: 'picks the path; the same seed gives the same shake' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

// angular frequencies in rad/s: two per axis, none a multiple of another
const FX = [41, 67], FY = [53, 79], WEIGHT = [0.62, 0.38];

/** The hit times from the param: finite, at or after 0; the default when none is valid. */
export function hitsOf(v) {
  const list = String(v ?? '').split(',').filter((s) => s.trim() !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return list.length ? list : [Number(DEFAULTS.hits)];
}

/** The envelope at scene second u: the strongest ring among the hits, 0 when still. */
export function envelope(u, hits, decay, settle = Infinity) {
  let e = 0;
  for (const t0 of hits) {
    if (!(u >= t0) || !(t0 < settle)) continue;
    const ring = Math.min(decay, settle - t0);
    const k = 1 - (u - t0) / ring;
    if (k > 0) e = Math.max(e, k * k);
  }
  return e;
}

export default {
  name: 'shake',
  group: 'moves',
  params,
  at(camera, p, ctx) {
    if (ctx?.deck) return;
    const prm = { ...DEFAULTS, ...ctx?.params };
    const u = Number(ctx?.u);
    if (!Number.isFinite(u)) return;
    const settle = Number(ctx?.settle) > 0 ? Number(ctx.settle) : Infinity;
    const decay = clamp(num(prm.decay, DEFAULTS.decay), 0.1, 1.5);
    const e = envelope(u, hitsOf(prm.hits), decay, settle);
    if (!(e > 0)) return;
    const travel = num(ctx?.style?.motion?.travel, 1);
    const a = clamp(num(prm.amp, DEFAULTS.amp), 0, 40) * Math.max(0, travel) * e;
    const next = random(Math.round(num(prm.seed, 0)) + 0x51a4e);
    const ph = [next(), next(), next(), next()].map((r) => r * Math.PI * 2);
    const x = a * (WEIGHT[0] * Math.sin(FX[0] * u + ph[0]) + WEIGHT[1] * Math.sin(FX[1] * u + ph[1]));
    const y = a * (WEIGHT[0] * Math.sin(FY[0] * u + ph[2]) + WEIGHT[1] * Math.sin(FY[1] * u + ph[3]));
    camera.style.translate = `${x.toFixed(3)}px ${y.toFixed(3)}px`;
  },
};

// bounce.js: a dropped object bouncing on the floor it lands on, in closed form. It falls in `fall`
// seconds, hits, and leaves each contact at `e` times the speed it arrived with (the coefficient of
// restitution), so each hop is e² as high as the last and lasts 2·eᵏ·fall: the contact times are a
// geometric series known before a frame is drawn, which places a sound on every contact and gives the
// entrance its length. An elastic material bounces more and squashes on each contact; a heavier object
// bounces less, so in one frame a light rubber ball outbounces a heavy wooden block. Pure in t.
// The closed-form restitution bounce follows Jolt Physics (MIT, Copyright 2021 Jorrit Rouwe); no code taken.

/** Restitution by material: how much of its speed an object keeps at a contact, before its weight. */
export const MATERIALS = { rigid: 0.3, wood: 0.42, plastic: 0.55, rubber: 0.78 };
/** How much a contact squashes the object at its first contact, by material (a share of its height). */
export const SQUASH = { rigid: 0, wood: 0.02, plastic: 0.05, rubber: 0.14 };
/** Weight by name, 0..1: a heavy object keeps 35 % less of its bounce than a light one of the same material. */
export const WEIGHTS = { light: 0, medium: 0.5, heavy: 1 };
/** A hop shorter than this (s) or lower than this share of the fall ends the bouncing: it settles. */
export const MIN_HOP_S = 0.08, MIN_HOP_HEIGHT = 0.012, MAX_CONTACTS = 8;
/** How long a contact's squash lasts, either side of the contact (s). */
export const SQUASH_S = 0.05;

const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);

/** A beat's bounce params read into { e, squash, fall }; unknown names fall back to plastic, medium, 0.42 s. */
export function bounceOf(params = {}) {
  const m = Object.hasOwn(MATERIALS, params.material) ? params.material : 'plastic';
  const w = Object.hasOwn(WEIGHTS, params.weight) ? WEIGHTS[params.weight] : Number.isFinite(Number(params.weight)) ? clamp01(Number(params.weight)) : WEIGHTS.medium;
  const fall = Number(params.fall) > 0 ? Math.min(2, Number(params.fall)) : 0.42;
  return { e: MATERIALS[m] * (1 - 0.35 * w), squash: SQUASH[m] * (1 - 0.5 * w), fall };
}

/**
 * The contacts of a bounce: [{ t, speed }] (seconds from the start; speed as a share of the first
 * impact's), the first at `fall`. Hops end when one would last under MIN_HOP_S or rise under
 * MIN_HOP_HEIGHT of the fall, or after MAX_CONTACTS.
 */
export function contacts({ e, fall }) {
  const out = [{ t: fall, speed: 1 }];
  for (let k = 1; k < MAX_CONTACTS; k++) {
    const hop = 2 * e ** k * fall;
    if (hop < MIN_HOP_S || e ** (2 * k) < MIN_HOP_HEIGHT) break;
    out.push({ t: out[k - 1].t + hop, speed: e ** k });
  }
  return out;
}

/** The bounce's length: its last contact, then the squash of that contact settling. */
export const bounceLength = (b) => contacts(b).at(-1).t + (b.squash > 0 ? SQUASH_S : 0);

/**
 * Where the object is `t` seconds into its bounce: { lift, squash, contact } — its height above its rest
 * as a share of the fall height (1 at the start, 0 on the floor), how squashed it is (a share of its
 * height, 0 in the air), and how many contacts it has made.
 */
export function bounceAt(t, b) {
  const cs = contacts(b);
  if (!(t > 0)) return { lift: 1, squash: 0, contact: 0 };
  const x = t / b.fall;
  let lift = 0, contact = cs.filter((c) => c.t <= t).length;
  if (t < cs[0].t) lift = 1 - x * x;
  else if (contact < cs.length) {
    const k = contact, s = (t - cs[k - 1].t) / b.fall;   // seconds into hop k, in falls
    lift = Math.max(0, 2 * b.e ** k * s - s * s);
  }
  let squash = 0;
  for (const c of cs) {
    const d = Math.abs(t - c.t);
    if (d < SQUASH_S) squash = Math.max(squash, b.squash * c.speed * (1 - d / SQUASH_S));
  }
  return { lift: clamp01(lift), squash, contact };
}

/** The level of each contact's sound, in dB against the first: a slight fall with the impact (half the physical slope), never under −12. */
export const contactLevelDb = (speed) => Math.max(-12, Math.round(10 * Math.log10(Math.max(speed, 1e-6)) * 10) / 10);

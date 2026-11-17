// emit.js: the particle emitter, as closed forms. A burst is a fixed set of particles, each drawn from
// a hash of (seed, particle index, attribute slot), so adding an attribute never reshuffles another and
// any instant is drawn alone, in any seek order. Particle i leaves its origin at a staggered instant and
// flies under gravity and linear drag in closed form; it lives a seeded share of the window and fades out
// before the window ends, so a rest never holds one. The emitter is opt-in: a brand allows it with a
// `particles` block (palette roles, a count and an area budget), and nothing is drawn without one.
// Four rules hold by construction: a burst fires on its beat's event (the landing that starts the
// emphasis), never as ambience; it paints palette roles only; it keeps to its count and to its share of
// the frame, and fades out near every line of type, so it never covers text; and it makes no sound, so
// the event's one cue is the beat's own `cue`.
// The burst recipe (rate-free bursts, life and speed ranges, drag and gravity in closed form, streaks
// along the velocity) follows three.quarks (MIT, Copyright 2019 Forrest Sun); no code taken.

/** The hard ceilings: particles in one burst, the share of the frame a burst may paint, a life in seconds. */
export const EMIT_LIMIT = { count: 64, area: 0.06, life: 1.6 };
/** A brand's `particles` block without `max` or `area`: this many particles and this share of the frame. */
export const EMIT_DEFAULTS = { max: 40, area: 0.025 };
/** The roles a particle may take. */
export const EMIT_ROLES = ['accent', 'ink', 'muted', 'surface', 'line', 'accentInk', 'canvas'];

const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);
const lerp = (r, u) => r[0] + (r[1] - r[0]) * u;

/** A 32-bit seed from a text (FNV-1a). */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A value in [0, 1) from three integers: the seed, the particle and the attribute slot. */
export function u01(seed, i, slot) {
  let h = Math.imul((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ Math.imul(slot + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// attribute slots: fixed, so a new attribute takes a new number and changes no other draw
const S = { delay: 0, life: 1, angle: 2, speed: 3, size: 4, role: 5, turn: 6, spin: 7, where: 8 };

/**
 * A brand's particle settings with every gap filled: { roles, max, area }, or null when the brand has
 * none (the emitter is then off). `max` and `area` are clamped to EMIT_LIMIT; unknown roles are dropped.
 */
export function particlesOf(style) {
  const p = style?.particles;
  if (!p || typeof p !== 'object') return null;
  const roles = (Array.isArray(p.roles) ? p.roles : []).filter((r) => EMIT_ROLES.includes(r) && style.color?.[r] != null);
  if (!roles.length) return null;
  const max = Math.max(1, Math.min(EMIT_LIMIT.count, Math.round(Number(p.max ?? EMIT_DEFAULTS.max)) || EMIT_DEFAULTS.max));
  const area = Math.max(0, Math.min(EMIT_LIMIT.area, Number(p.area ?? EMIT_DEFAULTS.area)));
  return { roles, max, area };
}

/**
 * The particles of one burst `a` seconds after its event, each { i, x, y, vx, vy, size, alpha, angle,
 * role, q } (q: share of its life lived), or [] before the event and after every life. Options:
 * `seed`, `count`, `origin(u, i)` → [x, y, dirX, dirY] (where particle i leaves from, given a seeded
 * u in [0, 1), and the outward direction there), `spread` (radians either side of that direction),
 * `speed` [lo, hi] px/s, `gravity` px/s² (down), `drag` per second, `life` [lo, hi] s (never past
 * `window`, the emphasis window, less 5 %), `size` [lo, hi] px, `spin` [lo, hi] rad/s, `stagger` s,
 * `roles` (how many roles to pick from), `fade` (the share of life over which it fades out).
 */
export function burstAt(a, o) {
  const out = [];
  if (!(a >= 0)) return out;
  const { seed, count, origin, spread = 0.5, speed, gravity = 0, drag = 0, size, spin = [0, 0], stagger = 0, roles = 1, fade = 0.4 } = o;
  const cap = Math.min(EMIT_LIMIT.life, (o.window ?? EMIT_LIMIT.life) * 0.95);
  for (let i = 0; i < count; i++) {
    const u = (slot) => u01(seed, i, slot);
    const t0 = u(S.delay) * stagger;
    const life = Math.min(cap - t0, lerp(o.life, u(S.life)));
    const age = a - t0;
    if (!(life > 0) || age < 0 || age >= life) continue;
    const [x0, y0, dx, dy] = origin(u(S.where), i);
    const ang = Math.atan2(dy, dx) + (u(S.angle) * 2 - 1) * spread;
    const v = lerp(speed, u(S.speed));
    const vx0 = Math.cos(ang) * v, vy0 = Math.sin(ang) * v;
    // linear drag k and gravity g in closed form: x = vx·f, y = vy·f + g·(t − f)/k, f = (1 − e^(−kt))/k
    const k = drag, e = k > 0 ? Math.exp(-k * age) : 1, f = k > 0 ? (1 - e) / k : age;
    const x = x0 + vx0 * f, y = y0 + vy0 * f + (k > 0 ? (gravity * (age - f)) / k : 0.5 * gravity * age * age);
    const vx = vx0 * e, vy = vy0 * e + gravity * f;
    const q = age / life;
    const alpha = Math.min(1, age / 0.03) * (q < 1 - fade ? 1 : clamp01((1 - q) / fade));
    out.push({ i, x, y, vx, vy, q, alpha, size: lerp(size, u(S.size)), angle: u(S.turn) * 2 * Math.PI + lerp(spin, u(S.spin)) * age, role: Math.floor(u(S.role) * roles) });
  }
  return out;
}

/**
 * How many of a burst's particles its budget admits: the first n, in index order, whose peak painted
 * areas (`peakArea(i)`) add up to at most `area` of the frame, and never more than `max`. Fixed for a
 * burst, so no particle appears mid-flight when another dies.
 */
export function admitted(count, { max, area, frame, peakArea }) {
  const cap = area * frame[0] * frame[1];
  let n = 0, total = 0;
  while (n < Math.min(count, max)) {
    const a = peakArea(n);
    if (total + a > cap) break;
    total += a; n++;
  }
  return n;
}

/**
 * How visible a particle may be beside the boxes it must not cover ([x, y, w, h] in frame pixels): 0
 * inside any box grown by `reach` (the particle's own extent), rising to 1 over `band` px beyond it.
 */
export function clearOf(x, y, boxes, reach, band) {
  let v = 1;
  for (const [bx, by, bw, bh] of boxes) {
    const dx = Math.max(bx - reach - x, 0, x - (bx + bw + reach)), dy = Math.max(by - reach - y, 0, y - (by + bh + reach));
    v = Math.min(v, band > 0 ? clamp01(Math.hypot(dx, dy) / band) : (dx || dy ? 1 : 0));
    if (!v) break;
  }
  return v;
}

/** A point on the edge of a box [x, y, w, h] at share u of its perimeter, with the outward direction there. */
export function onPerimeter([x, y, w, h], u, gap = 0) {
  let s = u * 2 * (w + h);
  if (s < w) return [x + s, y - gap, 0, -1];
  s -= w; if (s < h) return [x + w + gap, y + s, 1, 0];
  s -= h; if (s < w) return [x + w - s, y + h + gap, 0, 1];
  s -= w; return [x - gap, y + h - s, -1, 0];
}

// The drawing half: one canvas over the whole frame, appended to the emphasised slot (so the kit's
// restore removes it at the next seek), painting the admitted particles of the burst at the window's
// own seconds. The text it keeps clear of is every filled, visible slot of the scene, read where the
// scene lays it out at this instant, by its line boxes.
const streakLength = (p) => Math.min(p.size * 8, Math.max(p.size, Math.hypot(p.vx, p.vy) * 0.045));
const SHAPES = {
  // a spark: a short stroke along the velocity, longer while fast
  streak: { reach: (p) => streakLength(p), peak: (s) => s * 8 * s * 0.35, draw(c, p) {
    const sp = Math.hypot(p.vx, p.vy) || 1, len = streakLength(p);
    c.lineWidth = p.size * 0.35; c.lineCap = 'round';
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); c.stroke();
  } },
  // a confetti chip: a small card that flutters (its height swings with its turn)
  chip: { reach: (p) => p.size * 0.6, peak: (s) => s * s * 0.55, draw(c, p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.angle); c.scale(1, Math.max(0.15, Math.abs(Math.cos(p.angle * 1.7))));
    c.fillRect(-p.size / 2, -p.size * 0.275, p.size, p.size * 0.55); c.restore();
  } },
  // a dust puff: a soft round cloud that grows as it thins
  puff: { reach: (p) => p.size * (1 + 1.2 * p.q), peak: (s) => Math.PI * (s * 2.2) ** 2, draw(c, p) {
    const r = p.size * (1 + 1.2 * p.q);
    c.globalAlpha *= 0.35; c.beginPath(); c.arc(p.x, p.y, r, 0, 2 * Math.PI); c.fill();
  } },
};

function textBoxes(scene, stageBox, k) {
  const out = [];
  for (const slot of scene.querySelectorAll('[data-slot]')) {
    if (!slot.textContent.trim() || (slot.checkVisibility && !slot.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;   // text not shown yet (or gone) is not covered
    const range = slot.ownerDocument.createRange(); range.selectNodeContents(slot);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push([(r.left - stageBox.left) / k, (r.top - stageBox.top) / k, r.width / k, r.height / k]);
  }
  return out;
}

/**
 * Draws a burst recipe on `el` for an emphasis at window progress `p` (the window's seconds from
 * ctx.u): the pattern's `at` in one call. Does nothing when the brand has no `particles` block, at the
 * window's ends, or when no particle is alive. `recipe(box, S)` gives burstAt's options for the
 * slot's text box [x, y, w, h] in frame pixels and the frame's short side S, plus `shape` and `count`.
 */
export function drawBurst(el, p, ctx, recipe) {
  const allow = particlesOf(ctx.style);
  if (!allow || !(p > 0 && p < 1) || !(ctx.u >= 0)) return;
  const stage = el.closest('.mm-stage'), scene = el.closest('[data-scene]');
  if (!stage || !scene) return;
  const sb = stage.getBoundingClientRect(), k = sb.width / stage.offsetWidth || 1;
  const W = stage.offsetWidth, H = stage.offsetHeight, short = Math.min(W, H);
  const own = textBoxes(el, sb, k);
  const eb = el.getBoundingClientRect();
  const box = own.length
    ? [Math.min(...own.map((b) => b[0])), Math.min(...own.map((b) => b[1])), 0, 0]
    : [(eb.left - sb.left) / k, (eb.top - sb.top) / k, eb.width / k, eb.height / k];
  if (own.length) { box[2] = Math.max(...own.map((b) => b[0] + b[2])) - box[0]; box[3] = Math.max(...own.map((b) => b[1] + b[3])) - box[1]; }
  const r = recipe(box, short, ctx.params ?? {});
  const shape = SHAPES[r.shape];
  const seed = Math.floor(ctx.random() * 4294967296) >>> 0;
  const want = Math.max(1, Math.min(EMIT_LIMIT.count, Math.round(Number(ctx.params?.count ?? r.count))));
  const size = (i) => lerp(r.size, u01(seed, i, S.size));
  const n = admitted(want, { max: allow.max, area: allow.area, frame: [W, H], peakArea: (i) => shape.peak(size(i)) });
  const parts = burstAt(ctx.u, { ...r, seed, count: n, roles: allow.roles.length, window: ctx.d });
  if (!parts.length) return;
  const clear = textBoxes(scene, sb, k), band = short * 0.02;
  const doc = el.ownerDocument, cs = getComputedStyle(el);
  const canvas = doc.createElement('canvas');
  canvas.className = 'mm-emit';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = W; canvas.height = H;
  // the canvas covers the frame: placed from the slot's own corner, in the slot's own pixels
  const sx = eb.width / (el.offsetWidth || 1) || 1, sy = eb.height / (el.offsetHeight || 1) || 1;
  Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', left: `${-(eb.left - sb.left) / sx}px`, top: `${-(eb.top - sb.top) / sy}px`, width: `${(W * k) / sx}px`, height: `${(H * k) / sy}px` });
  if (cs.position === 'static') el.style.position = 'relative';
  el.append(canvas);
  const c = canvas.getContext('2d');
  const colours = allow.roles.map((role) => cs.getPropertyValue(`--mm-color-${role}`).trim() || cs.color);
  for (const q of parts) {
    const a = q.alpha * clearOf(q.x, q.y, clear, shape.reach(q), band);
    if (!(a > 0.004)) continue;
    c.globalAlpha = a; c.fillStyle = c.strokeStyle = colours[q.role];
    shape.draw(c, q);
  }
}

// rig.js: a brand's mascot as a puppet. The brand describes the character as data (style.mascot:
// a silhouette path per drawn view, a face frame, limb anchors with a layer, part colours as
// palette roles); the rig draws it as SVG groups filled from --mm-color-* variables, so every
// painted pixel is a role or a blend of roles. One transform stack moves the whole body about its
// ground point: offset, lean, then a squash that keeps the area (sy = 1 - s, sx = 1 / sy).
// Motion is closed forms of time only: an idle locked to the beat grid whose squash peaks on the
// beat, a hop entrance (anticipation, flight, landing squash), and an acted mood change (the eyes
// shut into the key, the face swaps while they are shut, a take, a settle). Any character fits the
// contract: extra parts (ears, a tail, an antenna, a hat, a held prop) swing about their anchors
// with follow-through read from the pose a moment earlier; a character with no legs floats and
// bobs; one with no arms simply has none; a face may be eyes only or sit on a screen plate; a brand
// may carry a cast of characters, picked by name. Pure in its inputs.

export const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
export const MOODS = ['calm', 'happy', 'excited', 'sad', 'surprised', 'worried', 'sleepy', 'proud'];
export const EYES = ['dot', 'wide', 'arc', 'droop', 'half', 'slant', 'line'];
export const MOUTHS = ['none', 'smile', 'grin', 'open', 'flat', 'frown', 'wobble'];
export const VIEWS = ['front', 'threeQuarter', 'side', 'back'];

// the acted change, in seconds: the key sits `key` into a window of `dur`; the eyes are shut for
// `hold` either side of it, close over `squintIn` before that and open over `squintOut` after; the
// pose blends over `blend`
export const ACT = { key: 0.16, dur: 1, hold: 0.05, squintIn: 0.1, squintOut: 0.14, blend: 0.4 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const lerp = (a, b, w) => a + (b - a) * w;
const z = (x) => x || 0;   // no negative zero in a pose
const num = (x) => String(Math.round(x * 1000) / 1000);
// path data only, every number under 1000 and without an exponent (the brand schema's own pattern)
const PATH = /^(?:[MmLlHhVvCcSsQqTtAaZz,\s]|[+-]?(?:\d{1,3}(?!\d)(?:\.\d*(?!\d)|(?!\.))|\.\d+(?!\d)))+$/;

// a back-out ease: overshoots by about 10 % and lands at exactly 1
export function backOut(x) {
  const t = clamp01(x) - 1, s = 1.5;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** Squash s about the ground point with the area kept: lower and wider for s > 0, taller and thinner below. */
export function squash(s) {
  const sy = 1 - Math.max(-0.45, Math.min(0.45, s));
  return { sx: s === 0 ? 1 : 1 / sy, sy };
}

/**
 * The beat accent at beat position bp: 1 on every `every`-th beat, a short rise into it (8 % of a
 * beat) and an exponential fall that reaches 0 before the next rise, so it is continuous.
 */
export function accent(bp, every = 1) {
  const x = bp / every;
  const ph = x - Math.floor(x);
  const rise = 0.08;
  if (ph > 1 - rise) return smooth((ph - (1 - rise)) / rise);
  const k = 6, tail = Math.exp(-k * (1 - rise));
  return (Math.exp(-k * ph) - tail) / (1 - tail);
}

// each mood: its face, the size of the take when entering it, its blush, its idle and where it looks
const MOOD = {
  calm:      { eyes: 'dot',   mouth: 'none',   take: 0.4, blush: 0,    idle: 'breathe', look: [0, 0] },
  happy:     { eyes: 'arc',   mouth: 'smile',  take: 0.8, blush: 0.55, idle: 'bounce',  look: [0, 0] },
  excited:   { eyes: 'wide',  mouth: 'grin',   take: 1.1, blush: 0.75, idle: 'hop',     look: [0, -0.3] },
  sad:       { eyes: 'droop', mouth: 'frown',  take: 0.3, blush: 0,    idle: 'rock',    look: [0, 0.6] },
  surprised: { eyes: 'wide',  mouth: 'open',   take: 1.3, blush: 0,    idle: 'tremble', look: [0, 0] },
  worried:   { eyes: 'slant', mouth: 'wobble', take: 0.6, blush: 0,    idle: 'shift',   look: [0, 0] },
  sleepy:    { eyes: 'half',  mouth: 'flat',   take: 0.2, blush: 0,    idle: 'sway',    look: [0, 0.3] },
  proud:     { eyes: 'dot',   mouth: 'smile',  take: 0.7, blush: 0.3,  idle: 'nod',     look: [0.2, -0.6] },
};

// idles: offsets in u (dx, dy), squash, lean in radians, arm angles (0 straight out, + up). Every
// squash accent peaks on a beat (sleepy on every second one); `amp` scales what moves, never the
// arms' resting angles.
const IDLE_HOP = 2;   // the excited idle's hop in u at idle 1: the largest lift any idle makes
const IDLES = {
  breathe: (bp) => ({ sq: 0.035 * accent(bp), arms: [-1.0, -1.0], swing: [0.08 * Math.sin(Math.PI * bp), -0.08 * Math.sin(Math.PI * bp)] }),
  bounce:  (bp) => ({ dy: -0.9 * Math.abs(Math.sin(Math.PI * bp)), sq: 0.12 * accent(bp), arms: [0.3, 0.3], swing: [0.4 * Math.sin(Math.PI * bp), -0.4 * Math.sin(Math.PI * bp)] }),
  hop:     (bp) => ({ dy: -IDLE_HOP * Math.abs(Math.sin(Math.PI * bp)), sq: 0.16 * accent(bp), arms: [1.0, 1.0], swing: [0.3 * Math.sin(2 * Math.PI * bp), 0.3 * Math.sin(2 * Math.PI * bp + Math.PI / 2)] }),
  rock:    (bp) => ({ rot: 0.06 * Math.sin((Math.PI * bp) / 2), sq: 0.05 * accent(bp), arms: [-1.25, -1.25], swing: [0, 0] }),
  tremble: (bp) => ({ dx: 0.06 * Math.sin(2 * Math.PI * 6 * bp), sq: 0.06 * accent(bp), arms: [0.9, 0.9], swing: [0.05 * Math.sin(2 * Math.PI * 6 * bp), -0.05 * Math.sin(2 * Math.PI * 6 * bp)] }),
  shift:   (bp) => ({ dx: 0.35 * Math.sin(Math.PI * bp), sq: 0.06 * accent(bp), lookX: -0.6 * Math.sin(Math.PI * bp), arms: [-0.5, -0.5], swing: [0.15 * Math.sin(Math.PI * bp), 0.15 * Math.sin(Math.PI * bp)] }),
  sway:    (bp) => ({ rot: 0.05 * Math.sin((Math.PI * bp) / 2), sq: 0.05 * accent(bp, 2), arms: [-1.3, -1.3], swing: [0, 0] }),
  nod:     (bp) => ({ sq: -0.03 + 0.08 * accent(bp), arms: [-0.35, -0.35], swing: [0.05 * Math.sin(Math.PI * bp), -0.05 * Math.sin(Math.PI * bp)] }),
};

/** The idle pose of a mood at piece time t on a grid of `bpm` from `offset` seconds; `amp` scales it. */
export function idle(mood, t, { bpm = 120, offset = 0, amp = 1 } = {}) {
  const m = MOOD[mood] ?? MOOD.calm;
  const bp = ((t - offset) * (bpm > 0 ? bpm : 120)) / 60;
  const f = IDLES[m.idle](bp);
  return {
    dx: z((f.dx ?? 0) * amp), dy: z((f.dy ?? 0) * amp), sq: z((f.sq ?? 0) * amp), rot: z((f.rot ?? 0) * amp),
    aL: f.arms[0] + f.swing[0] * amp, aR: f.arms[1] + f.swing[1] * amp, lookX: z((f.lookX ?? 0) * amp),
  };
}

/**
 * The hop entrance at linear progress q (0 to 1): fade in crouched (anticipation, to 22 %), fly a
 * parabola stretched at both ends (to 68 %), land squashed and ring down to exactly the rest pose.
 * `from` place hops on the spot; left or right travels `d` box widths (`width` in u).
 */
export function hop(q, { from = 'place', d = 1, width = 8 } = {}) {
  q = clamp01(q);
  const dir = from === 'left' ? -1 : from === 'right' ? 1 : 0;
  const x0 = dir * d * width;
  const H = dir ? 3 : 2.2;
  const out = { opacity: smooth(q / 0.1), dx: 0, dy: 0, sq: 0, rot: 0 };
  if (q < 0.22) {
    const k = smooth(q / 0.22);
    Object.assign(out, { dx: x0, sq: 0.22 * k, rot: 0.08 * k * (dir || 0) });
  } else if (q < 0.68) {
    const k = (q - 0.22) / 0.46;
    Object.assign(out, { dx: x0 * (1 - smooth(k)), dy: -H * 4 * k * (1 - k), sq: -0.16 * Math.abs(1 - 2 * k), rot: -0.1 * (dir || 0) * (1 - 2 * k) });
  } else if (q < 1) {
    const k = (q - 0.68) / 0.32;
    out.sq = 0.26 * (1 - k) * Math.exp(-3 * k) * Math.cos(2.6 * Math.PI * k);
  }
  for (const key of ['dx', 'dy', 'sq', 'rot']) out[key] = z(out[key]);
  return out;
}

/**
 * An acted mood change at `a` seconds from its key (negative before): the face shown, the squint
 * (eyes shut at the key, so the swap is never seen), the pose blend weight `w` (a back-out that
 * overshoots and has landed by ACT.blend), and the take's hop and squash.
 */
export function act(from, to, a, amt = 1) {
  const T = (MOOD[to]?.take ?? 0.5) * amt;
  let squint = 0, dy = 0, sq = 0;
  const { hold, squintIn, squintOut } = ACT;
  if (Math.abs(a) <= hold) squint = 1;
  else if (a < -hold && a >= -hold - squintIn) squint = smooth((a + hold + squintIn) / squintIn);
  else if (a > hold && a < hold + squintOut) squint = 1 - smooth((a - hold) / squintOut);
  if (a >= -0.1 && a < 0) sq = 0.12 * T * smooth((a + 0.1) / 0.1);   // the pre-squash: anticipation of the take
  if (a >= 0) {
    if (a < 0.22) dy = -1.1 * T * Math.sin((Math.PI * a) / 0.22);
    sq = -0.24 * T * Math.exp(-8 * a) * Math.cos(14 * a);
  }
  return { face: a < 0 ? from : to, squint, w: a <= 0 ? 0 : backOut(a / ACT.blend), dy: z(dy), sq: z(sq) };
}

/** A blink: about every 3.4 s for 0.13 s, phase-shifted by `seed` (0 to 1) so two characters never blink together. */
export function blink(t, seed = 0) {
  const P = 3.4, D = 0.13;
  const ph = (((t + seed * 2.9) % P) + P) % P;
  return ph < D ? Math.sin((Math.PI * ph) / D) : 0;
}

/** The rig's plain character, for a style whose brand has no mascot: a soft rounded body on two short legs. */
export const DEFAULT_MASCOT = {
  box: [8, 9],
  ground: [0, 0],
  views: {
    front: {
      body: 'M-3.6 -1.6 C-4.1 -1.6 -4.1 -2.4 -4.1 -4.8 C-4.1 -7.6 -2.4 -9 0 -9 C2.4 -9 4.1 -7.6 4.1 -4.8 C4.1 -2.4 4.1 -1.6 3.6 -1.6 Z',
      face: { cx: 0, cy: -5.4, gap: 2.4, size: 1 },
      limbs: [
        { kind: 'leg', x: -1.4, y: -2, width: 1 }, { kind: 'leg', x: 1.4, y: -2, width: 1 },
        { kind: 'arm', x: -3.7, y: -4, length: 1.8, width: 0.85 }, { kind: 'arm', x: 3.7, y: -4, length: 1.8, width: 0.85 },
      ],
    },
  },
};

const PARTS = ['body', 'shade', 'light', 'outline', 'eyes', 'glint', 'mouth', 'blush'];
// the part names that are colours; any other name in `parts` is an extra part
const COLOR_PARTS = [...PARTS, 'limbs', 'shadow', 'plate'];

/** A part colour as CSS: a role variable, or an sRGB blend of two roles; anything else is `fallback`. */
export function colorOf(part, fallback = 'ink') {
  const v = (r) => `var(--mm-color-${r})`;
  if (typeof part === 'string') return ROLES.includes(part) ? v(part) : v(fallback);
  if (part && ROLES.includes(part.role) && ROLES.includes(part.mix)) {
    const share = clamp01(Number(part.share) || 0);
    return `color-mix(in srgb, ${v(part.role)} ${num(100 - share * 100)}%, ${v(part.mix)})`;
  }
  return v(fallback);
}

// the darkest and the lightest palette roles: shade and shadow darken toward the first, light and
// cheeks lighten toward the second, so a dark brand is shaded as truly as a light one (on a dark
// brand ink is the light role). Without hexes to read: ink and surface.
function extremes(color) {
  let dark = 'ink', light = 'surface', lo = Infinity, hi = -Infinity;
  for (const r of ROLES) {
    const m = /^#([0-9a-f]{6})$/i.exec(color?.[r] ?? '');
    if (!m) continue;
    const n = parseInt(m[1], 16), l = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    if (l < lo) { lo = l; dark = r; }
    if (l > hi) { hi = l; light = r; }
  }
  return { dark, light };
}

// ---- path geometry -------------------------------------------------------------------------

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

// path data as absolute segments [cmd, ...args] (H and V keep one coordinate; S and T stay smooth)
function segments(d) {
  const tok = String(d).match(/[A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const out = [];
  let i = 0, cmd = null, x = 0, y = 0, x0 = 0, y0 = 0;
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    else if (!cmd) return out;
    const C = cmd.toUpperCase(), rel = cmd !== C, n = ARITY[C];
    if (n === undefined) return out;
    if (C === 'Z') { out.push(['Z']); x = x0; y = y0; continue; }
    const a = tok.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => !Number.isFinite(v))) return out;
    i += n;
    if (C === 'H') { const nx = rel ? x + a[0] : a[0]; out.push(['H', nx]); x = nx; continue; }
    if (C === 'V') { const ny = rel ? y + a[0] : a[0]; out.push(['V', ny]); y = ny; continue; }
    if (C === 'A') {
      const [ex, ey] = rel ? [x + a[5], y + a[6]] : [a[5], a[6]];
      out.push(['A', a[0], a[1], a[2], a[3], a[4], ex, ey]); x = ex; y = ey; continue;
    }
    const abs = a.map((v, k) => (rel ? v + (k % 2 ? y : x) : v));
    out.push([C, ...abs]);
    [x, y] = abs.slice(-2);
    if (C === 'M') { x0 = x; y0 = y; cmd = rel ? 'l' : 'L'; }
  }
  return out;
}

// points on an arc from (x1, y1), by its centre form (SVG implementation notes, F.6.5)
function arcPoints(x1, y1, [rx, ry, phi, fa, fs, x2, y2]) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const L = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let i = 1; i <= 24; i++) {
    const th = t1 + (dt * i) / 24;
    pts.push([cx + rx * Math.cos(th) * c - ry * Math.sin(th) * s, cy + rx * Math.cos(th) * s + ry * Math.sin(th) * c]);
  }
  return pts;
}

// the box {x0, y0, x1, y1} that holds the path: end points, the control points of curves (a curve
// stays inside their hull) and points along arcs; null for no drawable data
function pathBox(d) {
  let x = 0, y = 0, b = null;
  const add = (px, py) => { b = b ? { x0: Math.min(b.x0, px), y0: Math.min(b.y0, py), x1: Math.max(b.x1, px), y1: Math.max(b.y1, py) } : { x0: px, y0: py, x1: px, y1: py }; };
  for (const [C, ...a] of segments(d)) {
    if (C === 'Z') continue;
    if (C === 'H') x = a[0]; else if (C === 'V') y = a[0];
    else if (C === 'A') { for (const p of arcPoints(x, y, a)) add(...p); [x, y] = a.slice(-2); } else {
      for (let k = 0; k < a.length; k += 2) add(a[k], a[k + 1]);
      [x, y] = a.slice(-2);
    }
    add(x, y);
  }
  return b;
}

// the path with its x coordinates pulled toward `cx` by k (a body seen turned away); exact for
// lines and curves, and for arcs whose axes are not rotated
function narrowPath(d, k, cx) {
  const X = (v) => num(cx + (v - cx) * k);
  return segments(d).map(([C, ...a]) => {
    if (C === 'Z') return 'Z';
    if (C === 'H') return `H${X(a[0])}`;
    if (C === 'V') return `V${num(a[0])}`;
    if (C === 'A') return `A${num(a[0] * k)} ${num(a[1])} ${num(a[2])} ${a[3] ? 1 : 0} ${a[4] ? 1 : 0} ${X(a[5])} ${num(a[6])}`;
    return C + a.map((v, i) => (i % 2 ? num(v) : X(v))).join(' ');
  }).join(' ');
}

// how far a drawing may reach past its box before the rig refuses it, as a share of the box
const SLACK = 0.2;

// whether a point lies inside the mascot's box about its ground point (the slack aside)
const inBox = ([W, H], [gx, gy]) => (x, y) => Math.abs(x - gx) <= (0.5 + SLACK) * W && y >= gy - (1 + SLACK) * H && y <= gy + SLACK * H;

// what in a view reaches outside the mascot's box about its ground point (the slack aside)
function misfit(v, box, ground, name) {
  const ok = inBox(box, ground);
  const out = [];
  for (const key of ['body', 'strip', 'seam']) {
    if (v[key] == null) continue;
    const b = PATH.test(v[key]) ? pathBox(v[key]) : null;
    if (!b || !ok(b.x0, b.y0) || !ok(b.x1, b.y1)) out.push(`${name} ${key} reaches outside the box`);
  }
  for (const L of v.limbs ?? []) {
    if (!ok(L.x, L.y) || (L.length ?? 0) > 0.5 * Math.max(...box)) out.push(`${name} ${L.kind} at ${L.x}, ${L.y} reaches outside the box`);
  }
  if (v.face && !ok(v.face.cx, v.face.cy)) out.push(`${name} face sits outside the box`);
  return out;
}

// the extra parts of a character: every entry of `parts` that is not a colour, with its colour as
// CSS, its tip (the point whose lag sets its swing: given, or the centre of its drawing) and its
// reach (the furthest its drawing gets from the anchor); a part whose
// drawing or anchor leaves the box is dropped and named in `issues`
function extrasOf(src, body, issues) {
  const ok = inBox(src.box, src.ground);
  const out = [];
  for (const [name, A] of Object.entries(src.parts ?? {})) {
    if (COLOR_PARTS.includes(name) || !A || typeof A !== 'object' || typeof A.d !== 'string') continue;
    const b = PATH.test(A.d) ? pathBox(A.d) : null;
    const [ax, ay] = Array.isArray(A.anchor) ? A.anchor.map(Number) : [NaN, NaN];
    if (!b || !ok(b.x0, b.y0) || !ok(b.x1, b.y1) || !ok(ax, ay)) { issues.push(`extra part ${name} reaches outside the box`); continue; }
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
    const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x - ax, y - ay))) + (Number(A.stroke) || 0) / 2;
    const [tx, ty] = Array.isArray(A.tip) ? A.tip.map(Number) : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    out.push({
      name, d: A.d, ax, ay, rx: tx - ax, ry: ty - ay, reach,
      layer: A.layer === 'back' ? 'back' : 'front', swing: Math.min(2, Math.max(0, A.swing ?? 0.5)),
      stroke: Number(A.stroke) > 0 ? Number(A.stroke) : 0, views: Array.isArray(A.views) ? A.views : VIEWS,
      css: colorOf(A.color ?? body, 'accent'),
    });
  }
  return out;
}

/**
 * The style's mascot with every default filled in: views, parts as CSS colours, extra parts,
 * float, moods and faces. `who` picks a character of the brand's cast by name; an unknown name
 * draws the main character and says so in `issues`.
 */
export function resolveMascot(style, who) {
  const main = style?.mascot?.views?.front ? style.mascot : null;
  // a drawing that reaches outside the box it claims (a path traced at another scale) is refused:
  // the front takes the rig's default figure, any other view is made from the front
  const issues = [];
  let given = main;
  if (who) {
    const member = main?.cast?.[who];
    if (member?.views?.front) given = member;
    else issues.push(`no character named ${who} in the brand's cast: the main character is drawn`);
  }
  let geo = DEFAULT_MASCOT;
  if (given) {
    const front = misfit(given.views.front, given.box, given.ground, 'front');
    issues.push(...front);
    if (!front.length) {
      const views = { front: given.views.front };
      for (const name of VIEWS.slice(1)) {
        if (!given.views[name]) continue;
        const bad = misfit(given.views[name], given.box, given.ground, name);
        issues.push(...bad);
        if (!bad.length) views[name] = given.views[name];
      }
      geo = { box: given.box, ground: given.ground, views };
    }
  }
  const src = { ...(given ?? {}), ...geo };
  const { dark, light } = extremes(style?.color);
  const body = src.parts?.body ?? 'accent';
  const base = typeof body === 'string' ? body : body.role;
  // a screen face: the eyes and the mouth light up on a dark plate unless the brand says otherwise
  const plated = Object.values(src.views).some((v) => v.face?.plate);
  const parts = {
    body, shade: { role: base, mix: dark, share: 0.28 }, light: { role: base, mix: light, share: 0.35 },
    outline: 'ink', eyes: 'ink', glint: 'surface', mouth: 'ink', blush: { role: base, mix: light, share: 0.45 },
    ...(plated ? { plate: dark, eyes: light, mouth: light, glint: dark } : {}),
    ...(src.parts ?? {}),
  };
  const css = {};
  for (const k of PARTS) css[k] = colorOf(parts[k]);
  css.limbs = colorOf(parts.limbs ?? parts.body, 'accent');
  css.shadow = `color-mix(in srgb, ${colorOf(parts.shadow ?? dark)} 22%, transparent)`;
  if (plated) css.plate = colorOf(parts.plate ?? dark);
  const extras = geo !== DEFAULT_MASCOT ? extrasOf(src, parts.body, issues) : [];   // a refused drawing takes its parts with it
  const float = Math.min(20, Math.max(0, Number(src.float) || 0));
  // the body's reach above the ground (its parts and its float included), and the headroom over it
  // that every pose fits in: the liveliest idle's hop (3 u at idle 1.5), a little stretch and the
  // lean of a hop
  const [W, H] = src.box, gy = src.ground[1];
  const top = Math.max(H, ...Object.values(src.views).map((v) => gy - (pathBox(v.body)?.y0 ?? gy)), ...extras.map((A) => gy - A.ay + A.reach)) + float;
  return {
    box: src.box, ground: src.ground, views: src.views, css, issues, extras, float,
    top, head: top + IDLE_HOP * 1.5 + 0.05 * (H + W),
    outline: src.outline ?? 1,
    moods: src.moods?.length ? src.moods : MOODS,
    eyes: src.faces?.eyes?.length ? src.faces.eyes : EYES,
    mouths: src.faces?.mouths?.length ? src.faces.mouths : MOUTHS,
  };
}

/**
 * A view of the mascot: as drawn, or made from the front. A made 3/4 view narrows the silhouette,
 * moves and narrows the face toward the heading and shades the far limbs; a made side view narrows
 * it further, shows one eye and hides the far arm; the back has no face. `narrow` is the share of
 * the front's width the drawing keeps.
 */
export function viewOf(m, name) {
  const front = m.views.front;
  const face = (f, k) => f && { mouth: 1.3 * f.size, fw: 1, sides: 'both', ...f, ...k };
  if (name !== 'front' && m.views[name]) { const v = m.views[name]; return { ...v, narrow: 1, face: v.face === undefined ? null : face(v.face) }; }
  const f0 = front.face ?? null, W = m.box[0], gx = m.ground[0];
  const far = (L) => (L.side ?? (L.x < gx ? 'left' : 'right')) === 'left';
  if (name === 'threeQuarter') {
    return { ...front, narrow: 0.88, limbs: (front.limbs ?? []).map((L) => (far(L) ? { ...L, far: true } : L)), face: f0 && face(f0, { cx: f0.cx + 0.08 * W, fw: 0.78 }) };
  }
  if (name === 'side') {
    const limbs = (front.limbs ?? []).filter((L) => L.kind === 'leg' || !far(L)).map((L) => (far(L) ? { ...L, far: true } : L));
    return { ...front, narrow: 0.72, limbs, face: f0 && face(f0, { cx: f0.cx + 0.16 * W, fw: 0.55, sides: 'near' }) };
  }
  if (name === 'back') return { ...front, narrow: 1, face: null };
  return { ...front, narrow: 1, face: face(f0) };
}

/** A mood as the brand allows it: a mood outside its list is its first; a shape it does not allow is its first. */
export function moodOf(m, name) {
  const mood = m.moods.includes(name) ? name : m.moods[0];
  const d = MOOD[mood] ?? MOOD.calm;
  return { name: mood, ...d, eyes: m.eyes.includes(d.eyes) ? d.eyes : m.eyes[0], mouth: m.mouths.includes(d.mouth) ? d.mouth : m.mouths[0] };
}

const LOOKS = { center: [0, 0], left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

// a pose kept under the rig's headroom (m.head above the ground): how high the body's top reaches
// once lifted by -dy (a floating character's float included), stretched by sy and leant by rot; a
// pose that would reach higher gives up lift first, then stretch, so no pose is ever cut at the top
// of the slot
function headroom(m, dy, sq, rot) {
  const T = (m.top ?? m.box[1]) - (m.float ?? 0), hw = 0.5 * m.box[0], lim = (m.head ?? Infinity) - 0.02;
  const reach = (d, s) => { const sy = squash(s).sy; return -d + T * sy * Math.cos(rot) + hw * (1 / sy) * Math.abs(Math.sin(rot)); };
  if (reach(dy, sq) <= lim) return { dy, sq };
  dy = Math.min(0, dy + (reach(dy, sq) - lim));
  if (reach(dy, sq) <= lim || sq >= 0) return { dy, sq };
  let lo = sq, hi = 0;   // stretch: find the largest one that fits
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (reach(dy, mid) <= lim) hi = mid; else lo = mid; }
  return { dy, sq: hi };
}

// a floating character's gentle bob: up and back down over two beats of the idle's grid, in u
const BOB = 0.25;

function poseAt(o, m) {
  const h = hop(o.q ?? 1, { from: o.from, d: o.d ?? 1, width: m.box[0] });
  const grid = { bpm: o.bpm > 0 ? o.bpm : 120, offset: o.offset ?? 0, amp: Math.max(0, o.amp ?? 1) * (o.idleWeight ?? 1) };
  const t = o.t ?? 0;
  let face = moodOf(m, o.mood), squint = 0, take = { dy: 0, sq: 0 }, base = idle(face.name, t, grid);
  if (o.act) {
    const A = act(o.act.from, o.act.to, o.act.a, o.act.amt ?? 1);
    const fromM = moodOf(m, o.act.from), toM = moodOf(m, o.act.to);
    const i0 = idle(fromM.name, t, grid), i1 = idle(toM.name, t, grid);
    base = Object.fromEntries(Object.keys(i0).map((k) => [k, lerp(i0[k], i1[k], A.w)]));
    face = A.face === o.act.to ? toM : fromM;
    squint = A.squint; take = A;
  }
  const look = LOOKS[o.look] ?? LOOKS.center;
  // a floating character rests lifted by its float and bobs with the idle; others rest on the ground
  const lift = m.float > 0 ? -m.float - BOB * Math.min(1, m.float / 2) * grid.amp * 0.5 * (1 - Math.cos((Math.PI * (t - grid.offset) * grid.bpm) / 60)) : 0;
  const fit = headroom(m, h.dy + base.dy + take.dy + lift, h.sq + base.sq + take.sq, h.rot + base.rot);
  return {
    view: VIEWS.includes(o.view) ? o.view : 'front', facing: o.facing === 'left' ? 'left' : 'right', face,
    opacity: h.opacity, dx: z(h.dx + base.dx), dy: z(fit.dy), sq: z(fit.sq), rot: z(h.rot + base.rot),
    aL: base.aL, aR: base.aR, lookX: look[0] + face.look[0] + base.lookX, lookY: look[1] + face.look[1],
    squint, blink: o.blinks === false ? 0 : blink(t, o.seed ?? 0), blush: face.blush,
  };
}

// where a point of the drawing (views' coordinates) lands in the slot's unit at pose Q
function placed(m, Q, x, y) {
  const { sx, sy } = squash(Q.sq), f = Q.facing === 'left' ? -1 : 1;
  const X = f * sx * (x - m.ground[0]), Y = sy * (y - m.ground[1]), c = Math.cos(Q.rot), s = Math.sin(Q.rot);
  return [Q.dx + c * X - s * Y, Q.dy + s * X + c * Y];
}

// follow-through: each extra part turns about its anchor so that its tip trails where the anchor
// was a moment ago (0.08 s), plus a share of the change in that motion (0.2 s), which carries the
// swing past rest when the body stops; in degrees, at most 40 × swing, and exactly 0 at rest
const LAG = [0.08, 0.2];
function swingOf(m, P, L1, L2) {
  const out = {};
  const { sx, sy } = squash(P.sq), f = P.facing === 'left' ? -1 : 1, c = Math.cos(P.rot), s = Math.sin(P.rot);
  const floor = (0.1 * Math.max(...m.box)) ** 2;
  for (const A of m.extras) {
    if (!A.swing) { out[A.name] = 0; continue; }
    const [x, y] = placed(m, P, A.ax, A.ay), [x1, y1] = placed(m, L1, A.ax, A.ay), [x2, y2] = placed(m, L2, A.ax, A.ay);
    const wx = (x1 - x) - 0.5 * ((x2 - x) - 2.5 * (x1 - x)), wy = (y1 - y) - 0.5 * ((y2 - y) - 2.5 * (y1 - y));
    const lx = (c * wx + s * wy) / (f * sx), ly = (-s * wx + c * wy) / sy;   // into the part's own frame
    out[A.name] = z(A.swing * 40 * Math.tanh((2.5 * (A.rx * ly - A.ry * lx)) / Math.max(floor, A.rx * A.rx + A.ry * A.ry)));
  }
  return out;
}

/**
 * The whole pose of the character at one instant. `q` is the entrance's linear progress (1 = in
 * place) and `dur` its length in seconds; `t` the piece time the idle and blinks read;
 * `idleWeight` fades the idle in; `act` ({ from, to, a, amt }) an acted mood change around its
 * key. A character with extra parts also gets `swing`: each part's angle about its anchor.
 */
export function characterPose(o) {
  const m = o.mascot ?? resolveMascot({});
  const P = poseAt(o, m);
  if (m.extras?.length) {
    const back = (tau) => poseAt({
      ...o, t: (o.t ?? 0) - tau, q: o.dur > 0 ? (o.q ?? 1) - tau / o.dur : o.q,
      act: o.act && { ...o.act, a: o.act.a - tau },
    }, m);
    P.swing = swingOf(m, P, back(LAG[0]), back(LAG[1]));
  }
  return P;
}

// ---- drawing -------------------------------------------------------------------------------

const paint = (fill) => `style="fill: ${fill}"`;
const pen = (stroke, w) => `style="fill: none; stroke: ${stroke}; stroke-width: ${num(w)}; stroke-linecap: round; stroke-linejoin: round"`;

function brow(side, tilt, s, css) {
  const yi = -0.78 * s - tilt * s, yo = -0.78 * s + 0.25 * tilt * s;
  const [y0, y1] = side < 0 ? [yo, yi] : [yi, yo];
  return `<path d="M${num(-0.5 * s)} ${num(y0)} L${num(0.5 * s)} ${num(y1)}" ${pen(css.eyes, 0.17 * s)}/>`;
}

function eye(shape, x, side, s, P, css) {
  const shut = Math.max(P.squint, P.blink);
  if (shut > 0.8 || shape === 'line') return { shape: 'line', svg: `<path d="M${num(x - 0.45 * s)} 0 H${num(x + 0.45 * s)}" ${pen(css.eyes, 0.2 * s)}/>` };
  const lx = Math.max(-1, Math.min(1, P.lookX)) * 0.22 * s, ly = Math.max(-1, Math.min(1, P.lookY)) * 0.18 * s;
  const pupil = (rx, ry, g, dy = 0) => `<ellipse cx="${num(lx)}" cy="${num(ly + dy)}" rx="${num(rx * s)}" ry="${num(ry * s)}" ${paint(css.eyes)}/>`
    + `<circle cx="${num(lx + 0.12 * s)}" cy="${num(ly + dy - 0.2 * s)}" r="${num(g * s)}" ${paint(css.glint)}/>`;
  let inner;
  switch (shape) {
    case 'wide': inner = pupil(0.52, 0.64, 0.17); break;
    case 'arc': inner = `<path d="M${num(-0.45 * s)} ${num(0.18 * s)} Q0 ${num(-0.62 * s)} ${num(0.45 * s)} ${num(0.18 * s)}" ${pen(css.eyes, 0.2 * s)}/>`; break;
    case 'droop': inner = pupil(0.38, 0.42, 0.12, 0.1 * s) + brow(side, 0.22, s, css); break;
    case 'half': inner = `<path d="M${num(-0.42 * s)} 0 A${num(0.42 * s)} ${num(0.42 * s)} 0 0 0 ${num(0.42 * s)} 0 Z" ${paint(css.eyes)}/><path d="M${num(-0.5 * s)} 0 H${num(0.5 * s)}" ${pen(css.eyes, 0.17 * s)}/>`; break;
    case 'slant': inner = pupil(0.4, 0.48, 0.13) + brow(side, 0.42, s, css); break;
    default: inner = pupil(0.4, 0.5, 0.13);
  }
  return { shape, svg: `<g transform="translate(${num(x)} 0) scale(${num(1 + 0.15 * shut)} ${num(1 - 0.85 * shut)})">${inner}</g>` };
}

function mouth(shape, y, s, css) {
  const w = 0.18 * s, d = (p) => p.replace(/(-?[\d.]+)s/g, (_, k) => num(Number(k) * s));
  const at = (body) => `<g transform="translate(0 ${num(y)})">${body}</g>`;
  switch (shape) {
    case 'smile': return at(`<path d="${d('M-0.5s 0 Q0 0.55s 0.5s 0')}" ${pen(css.mouth, w)}/>`);
    case 'grin': return at(`<path d="${d('M-0.6s 0 H0.6s Q0.6s 0.75s 0 0.75s Q-0.6s 0.75s -0.6s 0 Z')}" ${paint(css.mouth)}/>`);
    case 'open': return at(`<ellipse cx="0" cy="${num(0.2 * s)}" rx="${num(0.3 * s)}" ry="${num(0.4 * s)}" ${paint(css.mouth)}/>`);
    case 'flat': return at(`<path d="${d('M-0.35s 0.1s H0.35s')}" ${pen(css.mouth, w)}/>`);
    case 'frown': return at(`<path d="${d('M-0.45s 0.3s Q0 -0.2s 0.45s 0.3s')}" ${pen(css.mouth, w)}/>`);
    case 'wobble': return at(`<path d="${d('M-0.5s 0.1s Q-0.25s -0.15s 0 0.1s Q0.25s 0.35s 0.5s 0.1s')}" ${pen(css.mouth, w)}/>`);
    default: return '';
  }
}

function limb(L, gx, gy, P, ow, css, k = 1) {
  const x = (L.x - gx) * k, y = L.y - gy, w = L.width;
  const side = L.side ?? (L.x < gx ? 'left' : 'right');
  let x1 = x, y1 = 0;
  if (L.kind === 'arm') {
    const a = side === 'left' ? P.aL : P.aR, dir = side === 'left' ? -1 : 1, len = L.length ?? 2;
    x1 = x + dir * len * Math.cos(a); y1 = y - len * Math.sin(a);
  }
  const d = `M${num(x)} ${num(y)} L${num(x1)} ${num(y1)}`;
  return (ow > 0 ? `<path class="mm-rig__limb" d="${d}" ${pen(css.outline, w + 2 * ow)}/>` : '') + `<path class="mm-rig__limb" d="${d}" ${pen(L.far ? css.shade : css.limbs, w)}/>`;
}

// an extra part: its shape (narrowed with the view), turned about its anchor by its swing
function extra(A, P, gx, gy, k, narrow, ow, css) {
  const d = k < 1 ? narrow(A.d) : A.d, ax = (A.ax - gx) * k, ay = A.ay - gy;
  const deg = P.swing?.[A.name] ?? 0;
  const lift = `transform="translate(${num(-gx)} ${num(-gy)})"`;
  const shape = A.stroke
    ? (ow > 0 ? `<path d="${d}" ${lift} ${pen(css.outline, A.stroke + 2 * ow)}/>` : '') + `<path d="${d}" ${lift} ${pen(A.css, A.stroke)}/>`
    : `<path d="${d}" ${lift} ${paint(A.css)}/>` + (ow > 0 ? `<path d="${d}" ${lift} ${pen(css.outline, ow)}/>` : '');
  return `<g class="mm-rig__part" data-part="${A.name}" data-swing="${num(deg)}" transform="rotate(${num(deg)} ${num(ax)} ${num(ay)})">${shape}</g>`;
}

// one character in its own unit, ground point at the origin
function figure(m, P, id) {
  const v = viewOf(m, P.view);
  const [W, H] = m.box, [gx, gy] = m.ground, css = m.css;
  const ow = 0.16 * m.outline;
  const k = v.narrow ?? 1, shape = (d) => (k < 1 ? narrowPath(d, k, gx) : d);
  const body = shape(PATH.test(v.body) ? v.body : DEFAULT_MASCOT.views.front.body);
  const { sx, sy } = squash(P.sq);
  const flip = P.facing === 'left' ? -1 : 1;
  const lift = `transform="translate(${num(-gx)} ${num(-gy)})"`;
  const limbs = (layer) => (v.limbs ?? []).filter((L) => (L.layer ?? 'back') === layer).map((L) => limb(L, gx, gy, P, ow, css, k)).join('');
  // seen from behind, what was in front goes behind and the other way round
  const side = (A) => (P.view === 'back' ? (A.layer === 'back' ? 'front' : 'back') : A.layer);
  const parts = (layer) => (m.extras ?? []).filter((A) => A.views.includes(P.view) && side(A) === layer).map((A) => extra(A, P, gx, gy, k, (d) => narrowPath(d, k, gx), ow, css)).join('');
  const f = 1 - Math.min(0.5, Math.abs(P.dy) * 0.08);
  let out = `<ellipse class="mm-rig__shadow" cx="${num(P.dx)}" cy="0" rx="${num(0.4 * W * f)}" ry="${num(0.055 * H * f)}" ${paint(css.shadow)}/>`;
  out += `<g class="mm-rig__body" transform="translate(${num(P.dx)} ${num(P.dy)}) rotate(${num((P.rot * 180) / Math.PI)}) scale(${num(flip * sx)} ${num(sy)})">`;
  out += `<clipPath id="${id}"><path d="${body}" ${lift}/></clipPath>`;
  out += parts('back');
  out += limbs('back');
  out += `<path class="mm-rig__fill" d="${body}" ${lift} ${paint(css.body)}/>`;
  out += `<g clip-path="url(#${id})"><ellipse cx="${num(-0.26 * W * k)}" cy="${num(-0.86 * H)}" rx="${num(0.17 * W)}" ry="${num(0.07 * H)}" ${paint(css.light)}/>`
    + `<rect x="${num(-W)}" y="${num(-0.34 * H)}" width="${num(2 * W)}" height="${num(0.34 * H)}" ${paint(css.shade)}/></g>`;
  if (v.strip && PATH.test(v.strip)) out += `<path d="${shape(v.strip)}" ${lift} ${paint(css.shade)}/>`;
  if (v.seam && PATH.test(v.seam) && ow > 0) out += `<path d="${shape(v.seam)}" ${lift} ${pen(css.outline, ow * 0.7)}/>`;
  if (ow > 0) out += `<path class="mm-rig__outline" d="${body}" ${lift} ${pen(css.outline, ow)}/>`;
  out += limbs('front');   // under the face, so an arm across the body never hides an eye or the mouth
  out += parts('front');
  let eyesDrawn = 'none';
  if (v.face) {
    const F = v.face, s = F.size;
    const xs = F.sides === 'near' ? [[0, 1]] : [[-F.gap / 2, -1], [F.gap / 2, 1]];
    let faceSvg = '';
    if (F.plate && css.plate) {
      const pw = F.plate.w, ph = F.plate.h, r = F.plate.r ?? 0.2 * Math.min(pw, ph), py = F.plate.y ?? 0.5 * F.mouth;
      faceSvg += `<rect class="mm-rig__plate" x="${num(-pw / 2)}" y="${num(py - ph / 2)}" width="${num(pw)}" height="${num(ph)}" rx="${num(r)}" style="fill: ${css.plate}${ow > 0 ? `; stroke: ${css.outline}; stroke-width: ${num(0.6 * ow)}` : ''}"/>`;
    }
    // a screen face shows no cheeks
    if (P.blush > 0 && !faceSvg) for (const [x, side] of xs) faceSvg += `<ellipse cx="${num(x + side * 0.25 * s)}" cy="${num(0.8 * s)}" rx="${num(0.42 * s)}" ry="${num(0.22 * s)}" ${paint(css.blush)} opacity="${num(P.blush)}"/>`;
    for (const [x, side] of xs) { const e = eye(P.face.eyes, x, side, s, P, css); eyesDrawn = e.shape; faceSvg += e.svg; }
    faceSvg += mouth(P.face.mouth, F.mouth, s, css);
    out += `<g class="mm-rig__face" data-face="${P.face.name}" transform="translate(${num(F.cx - gx)} ${num(F.cy - gy)}) scale(${num(F.fw)} 1)">${faceSvg}</g>`;
  }
  out += '</g>';
  return { svg: out, eyes: eyesDrawn };
}

/**
 * The SVG for one pose. `id` makes the clip ids unique in the page; `sheet` (moods, views or all)
 * draws a model sheet of the character at rest instead, laid out wide when `aspect` (slot w / h) is 1 or more.
 */
export function markup(m, P, { id = 'mmrig', sheet = null, aspect = 1 } = {}) {
  const [W, H] = m.box;
  // a single character gets the headroom every pose fits in; the cells of a sheet stand still
  const CW = 1.6 * W, top = sheet ? Math.max(1.16 * H, (m.top ?? 0) + 0.06 * H) : m.head ?? 1.16 * H, CH = top + 0.14 * H;
  const data = (p, eyes) => `data-mood="${p.face.name}" data-view="${p.view}" data-sq="${num(p.sq)}" data-dy="${num(p.dy)}" data-rot="${num(p.rot)}" data-squint="${num(p.squint)}" data-eyes="${eyes}" data-mouth="${p.face.mouth}"`;
  const head = (vb, extra) => `<svg class="mm-rig" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" style="overflow: hidden${P.opacity < 1 ? `; opacity: ${num(P.opacity)}` : ''}" ${extra}>`;
  if (!sheet) {
    const fig = figure(m, P, `${id}-clip`);
    return `${head(`${num(-CW / 2)} ${num(-top)} ${num(CW)} ${num(CH)}`, data(P, fig.eyes))}${fig.svg}</svg>`;
  }
  const views = sheet === 'moods' ? ['front'] : VIEWS;
  const moods = sheet === 'views' ? [P.face.name] : MOODS;
  const cells = [];
  for (const view of views) for (const mood of moods) cells.push({ view, mood });
  const wide = aspect >= 1;
  let cols, rows;
  if (sheet === 'all') [cols, rows] = wide ? [moods.length, views.length] : [views.length, moods.length];
  else { const n = cells.length; cols = wide ? Math.ceil(n / (n > 4 ? 2 : 1)) : Math.min(n, 2); rows = Math.ceil(n / cols); }
  let body = '';
  cells.forEach((c, i) => {
    const r = sheet === 'all' && !wide ? MOODS.indexOf(c.mood) : Math.floor(i / cols);
    const k = sheet === 'all' && !wide ? VIEWS.indexOf(c.view) : i % cols;
    const pose = characterPose({ mascot: m, mood: c.mood, view: c.view, blinks: false, amp: 0 });
    body += `<g class="mm-rig__cell" data-cell="${c.view}/${c.mood}" transform="translate(${num((k + 0.5) * CW)} ${num(r * CH + top)})">${figure(m, pose, `${id}-c${i}`).svg}</g>`;
  });
  return `${head(`0 0 ${num(cols * CW)} ${num(rows * CH)}`, `data-sheet="${sheet}"`)}${body}</svg>`;
}

/** Draws the pose into `el`, replacing the rig this element already shows. */
export function draw(el, m, P, opts = {}) {
  el.querySelector(':scope > svg.mm-rig')?.remove();
  el.insertAdjacentHTML('beforeend', markup(m, P, opts));
  return el.lastElementChild;
}

// Speaker framing: where the speaker's footage stands in the frame, scene by scene, and the face box
// that graphics keep clear of. Pure (Node and browser): every function returns the same value for the
// same arguments, so the frame at a scene's start is computed from the previous scene's mode and never
// remembered (AXIOM 1).
//
// A scene names a mode (`scene.frame`): hero (the layout's own full pose), side (a column left or
// right), inset (a picture in one corner), bottom (the lower part, a panel above) or hidden (parked
// below the frame, drawn at no opacity). The footage moves from the previous footage scene's mode to
// this one's on the style's move ease, starting LEAD_S before the scene (the panel) lands. A transition
// that is still running when the next one starts is the next one's starting pose, so the pose at any t
// is a recursion over the scenes before it, with no state. While held the box breathes by `drift`.

const lerp = (a, b, p) => a + (b - a) * p;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = (x) => Math.round(x * 100) / 100;

export const MODES = ['hero', 'side', 'inset', 'bottom', 'hidden'];
export const SIDES = ['left', 'right'];
export const CORNERS = ['tl', 'tr', 'bl', 'br'];
/** The footage starts moving this long before the scene that changes its mode lands (s). */
export const LEAD_S = 0.15;
/** A move lasts the style's `standard` duration, or this when the style gives none (s). */
export const MOVE_S = 0.52;
/** One slow breath of the held box (s). */
export const DRIFT_PERIOD_S = 9;
/** The face box is padded by this share of its own size on every side. */
export const FACE_PAD = 0.12;
/** An inset card's height over its width. */
export const INSET_ASPECT = 1.25;

/** What a brand sets once for every talking layout (`style.patterns["layouts/talking-full"]`, and the same for talking-cutout). */
export const KNOBS = {
  frame: 'hero',        // the mode of a scene that names none and has no panel
  panelFrame: 'side',   // the mode of a scene that names none and has a panel beat
  side: 'left',
  corner: 'br',
  sideSize: 0.42,       // the column's share of the frame's width
  insetSize: 0.42,      // the card's width as a share of the frame's shorter side
  bottomSize: 0.5,      // the speaker's share of the frame's height in bottom
  drift: 0.03,          // how far the held box breathes, as a share of its size (0 = still)
  face: '',             // "x,y,w,h" shares of the speaker's box; empty = the format's default
};

/** The default face box as shares of the speaker's box, by format: where a head sits when no matte says. */
export const FACE_DEFAULT = {
  '9x16': [0.25, 0.1, 0.5, 0.2],
  '1x1': [0.3, 0.06, 0.4, 0.34],
  '4x5': [0.28, 0.08, 0.44, 0.28],
  '16x9': [0.38, 0.08, 0.24, 0.42],
};

/** A brand's `face` knob ("x,y,w,h", shares) as [x, y, w, h], or null when it is empty or malformed. */
export function parseFace(s) {
  const v = String(s ?? '').split(',').map((x) => Number(x));
  return v.length === 4 && v.every((x) => Number.isFinite(x)) && v[2] > 0 && v[3] > 0 ? v : null;
}

/**
 * The frame a scene asks for, resolved over the brand's knobs: `raw` is the scene's `frame` (a mode, or
 * an object `{ mode, side, corner, size }`), `knobs` the brand's, `hasPanel` whether the scene has a
 * panel beat. Returns { mode, side, corner, sideSize, insetSize, bottomSize, drift }. An unknown mode is
 * hero, named in `bad`.
 */
export function resolveFrame(raw, knobs = {}, hasPanel = false) {
  const k = { ...KNOBS, ...knobs };
  const o = typeof raw === 'string' ? { mode: raw } : raw && typeof raw === 'object' ? raw : {};
  let mode = o.mode ?? (hasPanel ? k.panelFrame : k.frame);
  let bad = null;
  if (!MODES.includes(mode)) { bad = mode; mode = 'hero'; }
  const side = SIDES.includes(o.side) ? o.side : SIDES.includes(k.side) ? k.side : 'left';
  const corner = CORNERS.includes(o.corner) ? o.corner : CORNERS.includes(k.corner) ? k.corner : 'br';
  const size = Number.isFinite(Number(o.size)) && o.size != null ? clamp(Number(o.size), 0.15, 0.9) : null;
  return {
    mode, side, corner, bad,
    sideSize: mode === 'side' && size != null ? size : clamp(Number(k.sideSize), 0.15, 0.9),
    insetSize: mode === 'inset' && size != null ? size : clamp(Number(k.insetSize), 0.15, 0.9),
    bottomSize: mode === 'bottom' && size != null ? size : clamp(Number(k.bottomSize), 0.15, 0.9),
    drift: clamp(Number(k.drift) || 0, 0, 0.2),
  };
}

/**
 * The speaker's box for a mode in frame px { x, y, w, h, o } (o = opacity). `c` = { W, H, safe, hero }
 * where hero is the layout's own pose { x, y, w, h }.
 */
export function modeBox(f, c) {
  const { W, H, safe } = c;
  if (f.mode === 'side') {
    const w = r2(W * f.sideSize);
    return { x: f.side === 'left' ? 0 : r2(W - w), y: 0, w, h: H, o: 1 };
  }
  if (f.mode === 'bottom') {
    const h = r2(H * f.bottomSize);
    return { x: 0, y: r2(H - h), w: W, h, o: 1 };
  }
  if (f.mode === 'inset' || f.mode === 'hidden') {
    const w = r2(f.insetSize * Math.min(W, H));
    const h = Math.min(r2(w * INSET_ASPECT), H - 2 * safe);
    const x = f.corner[1] === 'l' ? safe : W - safe - w;
    const y = f.mode === 'hidden' ? H + safe : f.corner[0] === 't' ? safe : H - safe - h;
    return { x: r2(x), y: r2(y), w, h, o: f.mode === 'hidden' ? 0 : 1 };
  }
  return { ...c.hero, o: 1 };
}

/** The region the scene's panel slot fills { x, y, w, h }: the rest of the frame beside the speaker, or the safe area when the speaker is a card, hero or away. */
export function panelBox(f, c) {
  const { W, H, safe } = c;
  const full = { x: safe, y: safe, w: W - 2 * safe, h: H - 2 * safe };
  if (f.mode === 'side') {
    const w = W * f.sideSize;
    return f.side === 'left' ? { x: r2(w + safe), y: safe, w: r2(W - w - 2 * safe), h: full.h } : { x: safe, y: safe, w: r2(W - w - 2 * safe), h: full.h };
  }
  if (f.mode === 'bottom') return { x: safe, y: safe, w: full.w, h: r2(H * (1 - f.bottomSize) - 2 * safe) };
  return full;
}

/**
 * The speaker's pose at film second t. `keys` = [{ at, frame }] in order, one per scene that shows the
 * footage (at = the scene's start, frame = resolveFrame(...)). `c` = { W, H, safe, hero, ease(p), dur,
 * lead }. The first key is held until the second's lead begins; key k's move runs from the pose key
 * k - 1 had when it began, over `dur`, on `ease`. Pure in t.
 */
export function poseAt(keys, t, c) {
  const lead = c.lead ?? LEAD_S, dur = c.dur ?? MOVE_S;
  const pose = (k, x) => {
    const to = modeBox(keys[k].frame, c);
    if (k === 0) return to;
    const start = keys[k].at - lead;
    if (x <= start) return pose(k - 1, x);
    const from = pose(k - 1, start);
    const p = c.ease(clamp((x - start) / dur, 0, 1));
    return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), w: lerp(from.w, to.w, p), h: lerp(from.h, to.h, p), o: lerp(from.o, to.o, p) };
  };
  return pose(keys.length - 1, t);
}

// scale a box by s about its centre, except along an axis where it stands flush against a frame edge
// without spanning the frame (a column on the left edge): there it grows away from the edge
function grown(b, s, W, H) {
  const w = b.w * s, h = b.h * s;
  const anchor = (pos, size, grow, full) => (size >= full - 0.5 ? pos - (grow - size) / 2 : pos <= 0.5 ? pos : pos + size >= full - 0.5 ? pos + size - grow : pos - (grow - size) / 2);
  return { ...b, x: anchor(b.x, b.w, w, W), y: anchor(b.y, b.h, h, H), w, h };
}

/** A pose breathed by `drift`: s = 1 + drift (0.5 - 0.5 cos 2πt / period), a function of the film's t alone (W, H = the frame). */
export function drifted(b, t, drift, { W = Infinity, H = Infinity } = {}, period = DRIFT_PERIOD_S) {
  if (!(drift > 0)) return b;
  return grown(b, 1 + drift * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period)), W, H);
}

/** The same pose at the widest of its breath: what the face-safe zone is measured on, so a graphic standing clear of it does not slide with the drift. */
export function widest(b, drift, { W = Infinity, H = Infinity } = {}) {
  return drift > 0 ? grown(b, 1 + drift, W, H) : b;
}

/**
 * The face box in frame px, padded. `box` = the speaker's drawn box; `rec` = { w, h } the recording's
 * size, with `face` = the head's box in shares of the recording [x0, y0, x1, y1] (from the matte), maps
 * through the cover fit the picture is drawn with; with no matte (`face` null) `shares` = [x, y, w, h]
 * are shares of the box. Null when the speaker is not drawn (o under 0.5).
 */
export function faceRect(box, { rec = null, face = null, shares }, pad = FACE_PAD) {
  if (!box || box.o < 0.5) return null;
  let x, y, w, h;
  if (face && rec?.w > 0 && rec?.h > 0) {
    const k = Math.max(box.w / rec.w, box.h / rec.h);
    const ox = box.x + (box.w - rec.w * k) / 2, oy = box.y + (box.h - rec.h * k) / 2;
    x = ox + face[0] * rec.w * k; y = oy + face[1] * rec.h * k;
    w = (face[2] - face[0]) * rec.w * k; h = (face[3] - face[1]) * rec.h * k;
  } else {
    x = box.x + shares[0] * box.w; y = box.y + shares[1] * box.h; w = shares[2] * box.w; h = shares[3] * box.h;
  }
  return { x: r2(x - w * pad), y: r2(y - h * pad), w: r2(w * (1 + 2 * pad)), h: r2(h * (1 + 2 * pad)) };
}

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The smallest move { dx, dy } that takes `rect` clear of every obstacle and keeps it inside `bounds`
 * (all { x, y, w, h }). It tries standing beside each obstacle on each of its four sides and takes the
 * nearest place that is clear of all of them; a rect already clear stays; one that cannot be placed stays
 * put (W-FACE then reports it).
 */
export function clearFace(rect, obstacles, bounds) {
  const live = obstacles.filter(Boolean);
  if (!live.some((o) => hit(rect, o))) return { dx: 0, dy: 0 };
  const inside = (r) => r.x >= bounds.x - 0.5 && r.y >= bounds.y - 0.5 && r.x + r.w <= bounds.x + bounds.w + 0.5 && r.y + r.h <= bounds.y + bounds.h + 0.5;
  let best = null;
  for (const o of live) {
    for (const [dx, dy] of [[0, o.y - (rect.y + rect.h)], [0, o.y + o.h - rect.y], [o.x - (rect.x + rect.w), 0], [o.x + o.w - rect.x, 0]]) {
      const r = { ...rect, x: rect.x + dx, y: rect.y + dy };
      if (!inside(r) || live.some((q) => hit(r, q))) continue;
      const cost = Math.abs(dx) + Math.abs(dy);
      if (!best || cost < best.cost - 1e-6) best = { dx: r2(dx), dy: r2(dy), cost };
    }
  }
  return best ? { dx: best.dx, dy: best.dy } : { dx: 0, dy: 0 };
}

/** The median of a list of numbers (empty = null). */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

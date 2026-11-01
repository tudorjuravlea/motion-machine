// moves/along-path: an element rides a path (a cursor, a callout, a device, a point the camera dives to),
// turning to face the way it goes. The path is given as path data in its own coordinates and laid evenly
// into the frame, clear of a margin; the element is carried at constant speed from `pathStart` to
// `pathEnd` (shares of the path's length; a start after the end runs backwards), its heading the
// continuous tangent angle plus an offset, optionally softened over a window so a corner turns gradually.
// A trail can be drawn behind it, a line growing with it or a comet sliding with it, in one palette role.
// With target `camera` the camera dives towards the point and is back on the whole frame at rest.
// Before the carry the element waits at the path's start, after it stays at the end. Pure in the move's
// progress; the trail is an overlay drawn fresh on every seek (data-mm-overlay).
import { parse, bbox, fit, measure, stringify } from '../../../runtime/kit/pathkit.js';
import { windowAt, setDash } from '../../../runtime/kit/dash.js';
import { shares } from '../../../runtime/kit/morph.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const FRAMES = new Map();    // path data, frame and margin -> the path laid into the frame, measured

/** The path laid evenly into a W x H frame, `inset` (a share of the shorter side) clear on every side, and measured; null if it has no length. */
export function frameOf(d, W, H, inset = 0.12) {
  const key = `${d}|${W}|${H}|${inset}`;
  if (FRAMES.has(key)) return FRAMES.get(key);
  const path = parse(d), b = bbox(path);
  let out = null;
  if (b && (b.w > 0 || b.h > 0)) {
    const m = Math.min(W, H) * inset;
    const laid = fit(path, { x: b.x, y: b.y, w: Math.max(b.w, 1e-6), h: Math.max(b.h, 1e-6) }, { x: m, y: m, w: W - 2 * m, h: H - 2 * m });
    const meas = measure(laid, { resolution: 48 });
    if (meas.length > 0) out = { path: laid, meas, length: meas.length, d: stringify(laid, 2) };
  }
  FRAMES.set(key, out);
  return out;
}

/**
 * Where the carried point is at q (0 to 1) of the way: { x, y, angle (radians, continuous), f (the share of
 * the path) }. `start` and `end` are shares of the path's length (start after end runs backwards: the
 * heading turns half a way round); `offset` degrees are added to the heading; `window` (a share of the
 * path) averages the heading across a corner.
 */
export function carry(frame, q, { start = 0, end = 1, offset = 0, window = 0 } = {}) {
  const f = lerp(start, end, clamp01(q));
  const p = frame.meas.at(f, { window });
  return { x: p.x, y: p.y, angle: p.angle + (end < start ? Math.PI : 0) + (offset * Math.PI) / 180, f };
}

/**
 * The window of the path the trail draws at q: `line` grows with the carried point from the start, `comet` is
 * a segment of share `comet` of the path sliding with it, `none` is null. Shares of the whole path.
 */
export function trailWindow(kind, q, { start = 0, end = 1, comet = 0.25 } = {}) {
  if (kind !== 'line' && kind !== 'comet') return null;
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const w = windowAt(q, { comet: kind === 'comet' ? comet / Math.max(hi - lo, 1e-9) : 0, from: lo, to: hi });
  return end < start ? { a: hi - (w.b - lo), b: hi - (w.a - lo) } : w;
}

/** 0 at both ends of the move and 1 in the middle: how far the camera has dived towards the point. */
export const bump = (q) => Math.sin(Math.PI * clamp01(q));

// An element's box in the camera's own pixels, to a fraction of a pixel (layout offsets are whole pixels).
function boxIn(camera, el) {
  const c = camera.getBoundingClientRect(), r = el.getBoundingClientRect();
  const k = c.width / (camera.offsetWidth || 1) || 1;
  return { x: (r.left - c.left) / k, y: (r.top - c.top) / k, w: r.width / k, h: r.height / k };
}

const params = {
  path: { type: 'string', default: '', meaning: 'path data, in its own coordinates; it is laid evenly into the frame inside the margin' },
  target: { type: 'string', default: '', meaning: 'the slot to carry along the path, or `camera` to dive the camera towards the point' },
  start: { type: 'number', default: 0.6, meaning: 'seconds into the scene when the carry begins' },
  dur: { type: 'number', default: 1.8, meaning: 'seconds the carry lasts' },
  pathStart: { type: 'number', default: 0, meaning: 'where on the path it begins, as a share of its length (after pathEnd runs it backwards)' },
  pathEnd: { type: 'number', default: 1, meaning: 'where on the path it ends, as a share of its length' },
  turn: { type: 'enum(follow|off)', default: 'follow', meaning: 'follow turns the carried slot to face the way it goes; off keeps it upright' },
  turnOffset: { type: 'number', default: 0, meaning: 'degrees added to the heading (the slot\'s own forward is not always right)' },
  soften: { type: 'number', default: 0.03, meaning: 'a share of the path over which the heading is averaged, so a corner turns gradually (0 turns at once)' },
  anchor: { type: 'string', default: '50% 50%', meaning: 'the point of the slot that rides the path, as shares of its box ("50% 50%", "left center")' },
  inset: { type: 'number', default: 0.12, meaning: 'the margin kept clear around the path, as a share of the frame\'s short side' },
  trail: { type: 'enum(none|line|comet)', default: 'none', meaning: 'a line drawn behind the point as it goes: line grows with it, comet is a segment sliding with it' },
  comet: { type: 'number', default: 0.25, meaning: 'the comet\'s length as a share of the path' },
  ink: { type: 'enum(ink|accent|muted)', default: 'accent', meaning: 'the palette role the trail is drawn in' },
  weight: { type: 'number', default: 0.006, meaning: 'the trail\'s weight as a share of the frame\'s short side' },
  zoom: { type: 'number', default: 1.5, meaning: 'target camera: how far the camera dives towards the point (1 is not at all)' },
};

export default {
  name: 'along-path',
  group: 'moves',
  dur: 'slow',
  afterItems: true,
  params,
  at(camera, p, ctx) {
    const prm = ctx.params ?? {};
    const W = camera.offsetWidth, H = camera.offsetHeight;
    if (!W || !H) return;
    const frame = frameOf(String(prm.path ?? ''), W, H, Math.max(0, Math.min(0.4, Number(prm.inset) || 0)));
    if (!frame) return;
    const dur = Math.max(0.1, Number(prm.dur) || 1.8);
    const raw = ctx.u != null ? clamp01((ctx.u - (Number(prm.start) || 0)) / dur) : clamp01(p);
    const q = ctx.ease('move', raw);
    const opts = { start: Number(prm.pathStart) || 0, end: prm.pathEnd == null || prm.pathEnd === '' ? 1 : Number(prm.pathEnd), offset: Number(prm.turnOffset) || 0, window: Math.max(0, Number(prm.soften) || 0) };
    const at = carry(frame, q, opts);
    const doc = camera.ownerDocument;

    const win = trailWindow(prm.trail, q, { ...opts, comet: Number(prm.comet) || 0.25 });
    if (win) {
      const layer = doc.createElement('div');
      layer.className = 'mm-along';
      layer.setAttribute('data-mm-overlay', '');
      layer.setAttribute('data-ink', ['ink', 'accent', 'muted'].includes(prm.ink) ? prm.ink : 'accent');
      layer.style.setProperty('--mm-along-weight', r3(Math.min(0.03, Math.max(0.001, Number(prm.weight) || 0.006))));
      layer.innerHTML = `<svg viewBox="0 0 ${r2(W)} ${r2(H)}" aria-hidden="true"><path d="${frame.d}"/></svg>`;
      setDash(layer.querySelector('path'), win);
      camera.append(layer);
    }

    if (prm.target === 'camera') {
      const z = 1 + (Math.max(1, Number(prm.zoom) || 1.5) - 1) * bump(raw);
      if (z > 1.0005) {
        const tx = Math.min(0, Math.max(W - z * W, W / 2 - z * at.x)), ty = Math.min(0, Math.max(H - z * H, H / 2 - z * at.y));
        camera.style.transformOrigin = '0 0';
        camera.style.transform = `translate(${r2(tx)}px, ${r2(ty)}px) scale(${r3(z)})`;
      }
      return;
    }
    const slot = prm.target && camera.querySelector(`[data-slot="${prm.target}"]`);
    if (!slot) return;
    const [ax, ay] = shares(prm.anchor);
    const box = boxIn(camera, slot);
    const dx = at.x - (box.x + box.w * ax), dy = at.y - (box.y + box.h * ay);
    const deg = prm.turn === 'off' ? 0 : (at.angle * 180) / Math.PI;
    const own = slot.style.transform;
    slot.style.transformOrigin = `${r2(ax * 100)}% ${r2(ay * 100)}%`;
    slot.style.transform = `translate(${r2(dx)}px, ${r2(dy)}px) rotate(${r2(deg)}deg)${own ? ` ${own}` : ''}`;
  },
};

// drawn: a device first drawn in thin lines (the hairline style, runtime/kit/hairline.js), its
// glass lifted off the body on dashed guides; the glass settles, a band sweeps along the device and
// turns the lines into the real thing, and the device stands up into the camera. The timeline is a
// pure function of u, the seconds since the beat arrived. paintLines draws one frame of the lines
// into a 2D canvas laid over the device's WebGL canvas, from screen points the pattern projects
// with the same camera, so the drawing sits on the device in every pose.
import { cubicBezier } from './ease.js';
import { partial } from './hairline.js';

/** Each phase as [start, seconds], after the beat arrives. */
export const DRAWN = { draw: [0, 2.35], gather: [2.45, 0.7], reveal: [3.2, 1.3], rise: [4.35, 2.2] };
/** Hairline's discrete clock: a long ease-out. */
export const lift = cubicBezier(0.32, 0.72, 0, 1);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoother = (x) => { const t = clamp01(x); return t * t * t * (t * (6 * t - 15) + 10); };

/** Every phase's progress at u; a deck at rest shows the finished device. */
export function phases(u, { deck = false, rest = false } = {}) {
  if (deck && rest) return { draw: 1, gather: 1, reveal: 1, rise: 1 };
  const lin = (k) => clamp01((u - DRAWN[k][0]) / DRAWN[k][1]);
  return { draw: lin('draw'), gather: lift(lin('gather')), reveal: smoother(lin('reveal')), rise: smoother(lin('rise')) };
}

/** How much of a line is drawn at u when it starts at `start` and takes `dur` seconds: eased out. */
export function stroke(u, start, dur) { return lift(clamp01((u - start) / dur)); }

/** The lines' canvas over the device, sized to the holder, declared media like the WebGL canvas. */
export function linesCanvas(holder) {
  let cv = holder.querySelector(':scope > canvas.drawn__lines');
  if (!cv) {
    cv = holder.ownerDocument.createElement('canvas');
    cv.className = 'drawn__lines';
    cv.setAttribute('data-media', '');
    holder.append(cv);
  }
  const w = Math.max(2, Math.round(holder.clientWidth)), h = Math.max(2, Math.round(holder.clientHeight));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return cv;
}

const trace = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };

/**
 * One frame of the lines. parts, in paint order: { pts, closed, role (hi | edge | mid | lo), s (0..1
 * drawn), fill (a plate: filled with the ground colour so it hides what is behind), dash, dot (filled
 * with the role's colour), alpha, clip (points the part is clipped to) }. ink: the roles' colours and
 * plate. cover: the whole canvas starts filled with the plate, hiding the device behind. front: the
 * band that turns lines into the device, { a, b, s, feather, clip }: the canvas is cleared on the a
 * side of the point a + s (b - a) and kept, softly, past it; a bright line crosses the clip there.
 */
export function paintLines(cv, { parts, ink, lw, cover = false, front = null }) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, cv.width, cv.height);
  if (cover) { g.fillStyle = ink.plate; g.fillRect(0, 0, cv.width, cv.height); }
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const pt of parts) {
    if (!(pt.s > 0) || pt.pts.length < 2) continue;
    g.save();
    g.globalAlpha = pt.alpha ?? 1;
    if (pt.clip) { trace(g, pt.clip); g.closePath(); g.clip(); }
    if (pt.dot) {
      trace(g, pt.pts); g.closePath();
      g.globalAlpha *= pt.s; g.fillStyle = ink[pt.role]; g.fill();
    } else {
      if (pt.fill) { trace(g, pt.pts); g.closePath(); g.fillStyle = ink.plate; g.fill(); }
      const on = partial(pt.pts, pt.closed, pt.s);
      if (on.length > 1) {
        trace(g, on);
        g.setLineDash(pt.dash ? [lw * 1.1, lw * 3.4] : []);
        g.lineWidth = lw * (pt.weight ?? 1);
        g.strokeStyle = ink[pt.role];
        g.stroke();
      }
    }
    g.restore();
  }
  if (front) {
    const dx = front.b[0] - front.a[0], dy = front.b[1] - front.a[1], len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, fx = front.a[0] + dx * front.s, fy = front.a[1] + dy * front.s, f = front.feather;
    g.globalCompositeOperation = 'destination-in';
    const grad = g.createLinearGradient(fx, fy, fx + ux * f, fy + uy * f);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-over';
    if (front.clip && front.s > 0 && front.s < 1) {   // the bright edge of the band, across the device only
      const mx = fx + ux * f * 0.5, my = fy + uy * f * 0.5, far = cv.width + cv.height;
      g.save(); trace(g, front.clip); g.closePath(); g.clip();
      g.beginPath(); g.moveTo(mx - uy * far, my + ux * far); g.lineTo(mx + uy * far, my - ux * far);
      g.setLineDash([]); g.lineWidth = lw * 1.25; g.strokeStyle = ink.hi; g.stroke();
      g.restore();
    }
  }
}

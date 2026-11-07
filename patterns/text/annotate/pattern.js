// text/annotate: a small mark that points at a part of the frame, off the device: a tooltip with a
// tail, a curly brace along a span, a measure with end ticks, a dashed leader to an end dot, a status
// dot with two sonar rings, a crosshair, a timestamp or key chip. The slot's text is the label (the
// value, for a measure). The slot is an overlay area (a positioned box over the picture); the mark is
// drawn in that box's own pixels, from the point `at` ("x%,y%" of the box, or the name of a slot of
// the scene, whose text it points at). Lines are SVG, labels are HTML (so they are text the gate
// reads); lines draw by dash, the sonar rings expand once and are gone at rest.
import { boxOf, inkOf } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (s, a, b) => clamp01((s - a) / (b - a));
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.min(Math.max(x, a), Math.max(a, b));

export const KINDS = ['tooltip', 'brace', 'measure', 'leader', 'pulse', 'crosshair', 'chip'];

const params = {
  kind: { type: 'enum(tooltip|brace|measure|leader|pulse|crosshair|chip)', default: 'tooltip', meaning: 'tooltip: a bubble with a tail; brace: a curly brace drawn along a span, with a label; measure: a line with end ticks and a value; leader: a dashed leader to an end dot and a label; pulse: a status dot with two sonar rings that expand once; crosshair: a reticle with a label; chip: a timestamp or key chip' },
  at: { type: 'string', default: '50%,50%', meaning: 'the point: "x%,y%" of the overlay area, or the name of a slot of the same scene (its text is pointed at; a span kind runs along it)' },
  to: { type: 'string', default: '', meaning: 'the second point "x%,y%" of the overlay area: the far end of a brace or a measure, the end dot of a leader; empty takes the slot\'s text width, or a default offset' },
  place: { type: 'enum(auto|above|below|left|right)', default: 'auto', meaning: 'which side of the point the label (or a brace\'s bulge) sits on; auto takes the side with more room' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the lines and dots' },
  stroke: { type: 'number', default: 0.35, meaning: 'the weight of the lines as a share of the frame\'s short side, in percent (0.1 is a hairline, 0.8 is bold)' },
  face: { type: 'enum(auto|text|mono)', default: 'auto', meaning: 'the label\'s face: auto sets a measure and a chip in mono and the rest in the text face' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

const PCT = /^\s*(-?\d*\.?\d+)\s*%\s*,\s*(-?\d*\.?\d+)\s*%\s*$/;
/** "x%,y%" as pixels of a W by H area, or null when it is not that. */
export function parsePoint(str, W, H) {
  const m = PCT.exec(String(str ?? ''));
  return m ? { x: (Number(m[1]) / 100) * W, y: (Number(m[2]) / 100) * H } : null;
}

/**
 * Where a label of w by h goes beside the point (px, py), `gap` away, on the side `place` names
 * (auto: the side with room: above then below, or right then left), kept inside the W by H area.
 * Returns { x, y, side }.
 */
export function placeLabel({ px, py, w, h, gap, place = 'auto', W, H, horizontal = false }) {
  let side = place;
  if (side === 'auto') {
    side = horizontal
      ? (px + gap + w <= W ? 'right' : 'left')
      : (py - gap - h >= 0 ? 'above' : 'below');
  }
  const at = {
    above: [px - w / 2, py - gap - h], below: [px - w / 2, py + gap],
    left: [px - gap - w, py - h / 2], right: [px + gap, py - h / 2],
  }[side] ?? [px - w / 2, py - gap - h];
  return { x: clamp(at[0], 0, W - w), y: clamp(at[1], 0, H - h), side };
}

/** A curly brace along a span of length L, bulging to local -y by d: two halves that meet at the cusp (2d out). */
export function bracePath(L, d) {
  const m = L / 2;
  return {
    a: `M0 0 Q0 ${r1(-d)} ${r1(d)} ${r1(-d)} L${r1(Math.max(d, m - d))} ${r1(-d)} Q${r1(m)} ${r1(-d)} ${r1(m)} ${r1(-2 * d)}`,
    b: `M${r1(L)} 0 Q${r1(L)} ${r1(-d)} ${r1(L - d)} ${r1(-d)} L${r1(Math.min(L - d, m + d))} ${r1(-d)} Q${r1(m)} ${r1(-d)} ${r1(m)} ${r1(-2 * d)}`,
  };
}

/** The dashes of the line (x0,y0) to (x1,y1) that are drawn at `draw` (0 to 1): [[ax, ay, bx, by], …]. */
export function dashSegments(x0, y0, x1, y1, dash, gap, draw) {
  const len = Math.hypot(x1 - x0, y1 - y0), out = [];
  if (!(len > 0) || !(draw > 0)) return out;
  const reach = len * clamp01(draw), at = (s) => [x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len];
  for (let s = 0; s < reach - 1e-6; s += dash + gap) out.push([...at(s), ...at(Math.min(s + dash, reach))]);
  return out;
}

const line = (x0, y0, x1, y1, extra = '') => `<line class="mm-an__line" x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}" ${extra}/>`;

// The point and, for the span kinds, the second point, in the overlay's pixels.
function targets(el, prm, W, H, u) {
  const own = parsePoint(prm.at, W, H);
  const to = parsePoint(prm.to, W, H);
  if (own) return { p: own, q: to, slot: false };
  const name = String(prm.at || '').trim();
  const target = name ? el.closest?.('.mm-camera')?.querySelector(`[data-slot="${name}"]`) : null;
  const host = boxOf(el), ink = target && target !== el ? inkOf(target) : null;
  if (!host || !ink) return { p: { x: W / 2, y: H / 2 }, q: to, slot: false };
  const x0 = ink.x0 - host.x0, x1 = ink.x1 - host.x0, y0 = ink.y0 - host.y0, y1 = ink.y1 - host.y0;
  const below = y1 + u * 0.1;
  return { p: to ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: x0, y: below }, q: to ?? { x: x1, y: below }, slot: true, mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, top: y0, bottom: y1 };
}

export default {
  name: 'annotate',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const doc = el.ownerDocument;
    const kind = KINDS.includes(prm.kind) ? prm.kind : DEFAULTS.kind;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const lin = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const e = (x) => ctx.ease('enter', x);
    const W = el.offsetWidth, H = el.offsetHeight, u = ctx.unit;
    if (!W || !H) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const draw = e(seg(lin, 0, 0.6)), label = e(seg(lin, 0.4, 0.9));
    const T = targets(el, prm, W, H, u);
    let { p: P, q: Q } = T;
    const tick = u * 0.07, gap = u * 0.12;
    const face = prm.face === 'text' || prm.face === 'mono' ? prm.face : (kind === 'measure' || kind === 'chip' ? 'mono' : 'text');
    const stroke = Math.min(1.5, Math.max(0.05, Number(prm.stroke) || DEFAULTS.stroke));

    const root = doc.createElement('div');
    root.className = 'mm-an';
    root.dataset.kind = kind;
    root.dataset.tone = ['accent', 'ink', 'muted'].includes(prm.tone) ? prm.tone : 'accent';
    root.dataset.face = face;
    root.style.setProperty('--mm-an-stroke', `calc(min(var(--mm-frame-w), var(--mm-frame-h)) * ${r1(stroke * 100) / 10000})`);
    let svg = '', labelAt = null, labelScale = 0.88, origin = null;
    const lab = doc.createElement('span');
    lab.className = 'mm-an__label';
    lab.textContent = text;
    if (!text) lab.hidden = true;
    root.append(lab);
    el.replaceChildren(root);
    const w = lab.hidden ? 0 : lab.offsetWidth, h = lab.hidden ? 0 : lab.offsetHeight;

    if (kind === 'tooltip') {
      const pl = placeLabel({ px: P.x, py: P.y, w, h, gap: gap * 1.6, place: prm.place, W, H });
      labelAt = pl; origin = [P.x - pl.x, P.y - pl.y];
      const above = pl.side === 'above', by = above ? pl.y + h : pl.y, half = tick * 0.9;
      const bx = clamp(P.x, pl.x + half * 1.6, pl.x + w - half * 1.6);
      const k = e(seg(lin, 0, 0.5));
      svg = `<g transform="translate(${r1(P.x)} ${r1(P.y)}) scale(${r1(k * 1000) / 1000 || 0.001}) translate(${r1(-P.x)} ${r1(-P.y)})">`
        + `<polygon class="mm-an__surface" points="${r1(bx - half)},${r1(by)} ${r1(bx + half)},${r1(by)} ${r1(P.x)},${r1(P.y)}"/></g>`;
    } else if (kind === 'brace' || kind === 'measure') {
      if (!Q) Q = { x: P.x + W * 0.3, y: P.y };
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const nx = dy / L, ny = -dx / L;   // the normal that local -y points along
      const want = { above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0] }[prm.place]
        ?? (T.slot ? [0, 1] : (P.y < H / 2 ? [0, 1] : [0, -1]));
      const sign = nx * want[0] + ny * want[1] >= 0 ? 1 : -1;   // 1: bulge along the normal
      if (kind === 'brace') {
        const d = Math.min(u * 0.16, L / 6), bp = bracePath(L, d);
        const flip = sign === 1 ? 1 : -1;
        svg = `<g transform="translate(${r1(P.x)} ${r1(P.y)}) rotate(${r1(ang)}) scale(1 ${flip})">`
          + `<path class="mm-an__line" d="${bp.a}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${r1((1 - draw) * 1000) / 1000}"/>`
          + `<path class="mm-an__line" d="${bp.b}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${r1((1 - draw) * 1000) / 1000}"/></g>`;
        const cx = (P.x + Q.x) / 2 + nx * sign * 2 * d, cy = (P.y + Q.y) / 2 + ny * sign * 2 * d;
        const side = Math.abs(nx * sign) > Math.abs(ny * sign) ? (nx * sign > 0 ? 'right' : 'left') : (ny * sign > 0 ? 'below' : 'above');
        labelAt = placeLabel({ px: cx, py: cy, w, h, gap: gap * 0.6, place: side, W, H });
      } else {
        const cx = (P.x + Q.x) / 2, cy = (P.y + Q.y) / 2, k = draw;
        const tx = (dy / L) * tick, ty = (-dx / L) * tick;
        svg = line(P.x, P.y, P.x + dx * k, P.y + dy * k)
          + (k >= 1 ? line(P.x - tx, P.y - ty, P.x + tx, P.y + ty) + line(Q.x - tx, Q.y - ty, Q.x + tx, Q.y + ty) : '');
        labelAt = { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h) };
        labelScale = 1;
      }
    } else if (kind === 'leader') {
      if (!Q) Q = { x: clamp(P.x + W * 0.22, 0, W), y: clamp(P.y - H * 0.1, 0, H) };
      const segs = dashSegments(P.x, P.y, Q.x, Q.y, u * 0.08, u * 0.05, draw);
      const r = u * 0.045;
      svg = `<circle class="mm-an__ring" cx="${r1(P.x)}" cy="${r1(P.y)}" r="${r1(r * 1.6 * Math.min(1, draw * 4))}"/>`
        + segs.map((s) => line(...s)).join('')
        + (draw >= 1 ? `<circle class="mm-an__fill" cx="${r1(Q.x)}" cy="${r1(Q.y)}" r="${r1(r)}"/>` : '');
      const right = Q.x >= P.x;
      labelAt = { x: clamp(right ? Q.x + r + gap * 0.6 : Q.x - r - gap * 0.6 - w, 0, W - w), y: clamp(Q.y - h / 2, 0, H - h) };
    } else if (kind === 'pulse') {
      const r = u * 0.06, pop = e(seg(lin, 0, 0.3));
      svg = `<circle class="mm-an__fill" cx="${r1(P.x)}" cy="${r1(P.y)}" r="${r1(r * pop)}"/>`;
      for (let i = 0; i < 2; i++) {
        const t = seg(lin, 0.3 + 0.2 * i, 0.75 + 0.2 * i);
        if (t > 0 && t < 1) svg += `<circle class="mm-an__ring" cx="${r1(P.x)}" cy="${r1(P.y)}" r="${r1(r * (1.4 + 3.4 * e(t)))}" opacity="${r1((1 - t) * 800) / 1000}"/>`;
      }
      labelAt = placeLabel({ px: P.x, py: P.y, w, h, gap: r * 2.4, place: prm.place, W, H, horizontal: true });
    } else if (kind === 'crosshair') {
      const r = u * 0.2, k = 1 + 0.6 * (1 - draw), arm = u * 0.16;
      svg = `<circle class="mm-an__line" cx="${r1(P.x)}" cy="${r1(P.y)}" r="${r1(r * k)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${r1((1 - draw) * 1000) / 1000}"/>`
        + [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ax, ay]) => line(P.x + ax * (r * 0.45) * k, P.y + ay * (r * 0.45) * k, P.x + ax * (r * 0.45 + (r * 0.55 + arm) * draw) * k, P.y + ay * (r * 0.45 + (r * 0.55 + arm) * draw) * k)).join('')
        + `<circle class="mm-an__fill" cx="${r1(P.x)}" cy="${r1(P.y)}" r="${r1(u * 0.02 * draw)}"/>`;
      labelAt = placeLabel({ px: P.x, py: P.y, w, h, gap: r + arm + gap * 0.4, place: prm.place, W, H, horizontal: true });
    } else {   // chip
      labelAt = { x: clamp(P.x - w / 2, 0, W - w), y: clamp(P.y - h / 2, 0, H - h) };
      labelScale = 0.6;
    }

    if (svg) root.insertAdjacentHTML('afterbegin', `<svg class="mm-an__svg" width="${r1(W)}" height="${r1(H)}" viewBox="0 0 ${r1(W)} ${r1(H)}" aria-hidden="true">${svg}</svg>`);
    if (labelAt && !lab.hidden) {
      lab.style.left = `${r1(labelAt.x)}px`;
      lab.style.top = `${r1(labelAt.y)}px`;
      lab.style.opacity = r1(label * 1000) / 1000 >= 1 ? '' : String(r1(label * 1000) / 1000);
      if (label < 1) {
        lab.style.transformOrigin = origin ? `${r1(origin[0])}px ${r1(origin[1])}px` : 'center';
        lab.style.scale = String(r1((labelScale + (1 - labelScale) * label) * 1000) / 1000);
      }
    }
  },
};

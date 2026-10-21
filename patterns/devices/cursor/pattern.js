// devices/cursor: a pointer that follows a path as p runs 0 -> 1, then clicks. The path is a list
// of points in percent of the host slot, "x,y x,y ..." (params.path, or data-path on the slot).
// Segments take time in proportion to their length and each eases in and out, so the pointer
// pauses at the waypoints; the click ring pulses in the last 15 % and is gone at p = 1.
// Position is a pure function of p. The slot's text is ignored.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const MARKUP = '<div class="cursor" data-device="cursor"><i class="cursor__ring"></i><svg class="cursor__arrow" viewBox="0 0 24 24" aria-hidden="true"><path class="cursor__shape" d="M5 3 L19 11 L13 12.8 L10 19 Z"/></svg></div>';
const DEFAULT_PATH = '20,30 50,55 75,45';

function parsePath(s) {
  const pts = String(s).trim().split(/\s+/).map((pair) => pair.split(',').map(Number))
    .filter((c) => c.length === 2 && c.every(Number.isFinite));
  return pts.length ? pts : parsePath(DEFAULT_PATH);
}

// Point on the polyline at fraction u of its total length, easing within each segment.
export function pointAt(pts, u) {
  if (pts.length === 1) return pts[0];
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) || 1e-6; lens.push(l); total += l; }
  let at = clamp(u, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (at <= lens[i] || i === lens.length - 1) {
      const t = smooth(clamp(at / lens[i], 0, 1));
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    at -= lens[i];
  }
  return pts[pts.length - 1];
}

function build(el) {
  let root = el.querySelector(':scope > [data-device]');
  if (!root) {
    el.textContent = '';
    el.insertAdjacentHTML('beforeend', MARKUP);
    root = el.firstElementChild;
  }
  return root;
}

const DEVICE = {
  name: 'cursor',
  group: 'devices',
  params: {
    path: { type: 'string', default: DEFAULT_PATH, meaning: 'waypoints as "x,y x,y ..." in percent of the host slot' },
    click: { type: 'boolean', default: true, meaning: 'pulse a ring at the last point' },
  },
  at(el, p, ctx) {
    const root = build(el);
    const q = clamp(Number(p), 0, 1);
    const pts = parsePath(ctx?.params?.path ?? el.dataset.path ?? DEFAULT_PATH);
    const [x, y] = pointAt(pts, q);
    root.style.left = `${x.toFixed(3)}%`;
    root.style.top = `${y.toFixed(3)}%`;
    root.style.opacity = String(clamp(q / 0.1, 0, 1));
    const ring = root.querySelector('.cursor__ring');
    const t = clamp((q - 0.85) / 0.15, 0, 1);
    const on = (ctx?.params?.click ?? true) !== false && ctx?.params?.click !== 'false';
    ring.style.opacity = on ? String((Math.sin(Math.PI * t) * 0.9).toFixed(4)) : '0';
    ring.style.transform = `scale(${(0.5 + t).toFixed(4)})`;
  },
};
export default DEVICE;

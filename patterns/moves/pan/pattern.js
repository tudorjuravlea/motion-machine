// moves/pan: the camera slides across the scene. `dir` is where the camera goes; the content
// slides the other way. The sweep is symmetric about rest (+d/2 -> -d/2 of content travel), so the
// middle of the scene is flat. Pure in p; d bounded [0, 160] and each half-sweep is capped by the
// room the slots have before the safe margin, so nothing crosses it.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Layout geometry, read from offsets so the camera's own transform never feeds back.
// Union box of the slots that take space, in camera coordinates (null when there are none).
function extent(camera) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of camera.querySelectorAll('[data-slot]')) {
    if (!s.offsetWidth || !s.offsetHeight) continue;
    let x = 0, y = 0, n = s;
    while (n && n !== camera) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + s.offsetWidth); y1 = Math.max(y1, y + s.offsetHeight);
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}
// The safe margin plus 1 px of slack for layout rounding.
const safeOf = (el) => 1 + (parseFloat(el.ownerDocument.defaultView.getComputedStyle(el.ownerDocument.documentElement).getPropertyValue('--mm-safe')) || 0);
// Largest scale about (ox, oy) that keeps `box` inside the frame inset by `m`.
function maxScale(box, W, H, m, ox, oy) {
  let s = Infinity;
  for (const [e, o, lo, hi] of [[box.x0, ox, m, W - m], [box.x1, ox, m, W - m], [box.y0, oy, m, H - m], [box.y1, oy, m, H - m]]) {
    if (e > o) s = Math.min(s, (hi - o) / (e - o)); else if (e < o) s = Math.min(s, (o - lo) / (o - e));
  }
  return s;
}

// target = media: the move runs on every picture a pattern declares (an <img> or <video> with
// data-media and a src) inside the camera, each scaled about its own centre inside the frame that
// clips it, so the camera and the type stay put and no safe-margin cap applies.
const pictures = (camera) => [...camera.querySelectorAll('img[data-media][src], video[data-media][src]')].filter((m) => m.offsetWidth > 0 && m.offsetHeight > 0);

const DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
// end = settle: the move is over at the scene's settle instant (ctx.settle, seconds from the scene's
// start, supplied by the kit) and holds there, so the rest is still. Film only: a deck's p runs over
// presses and ctx.u is absent, so a deck move is unchanged.
function through(p, ctx) {
  const s = Number(ctx?.settle);
  if (param(ctx, 'end') !== 'settle' || !(s > 0) || !(ctx.u >= 0)) return p;
  const x = Math.min(1, ctx.u / s);
  return ctx.ease ? ctx.ease('move', x) : x;
}
const MOVE = {
  name: 'pan',
  group: 'moves',
  params: {
    dir: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'where the camera goes (content slides the opposite way)' },
    d: { type: 'number', default: 48, meaning: 'total sweep in px before the style travel multiplier and the safe-margin cap' },
    target: { type: 'enum(camera|media)', default: 'camera', meaning: 'camera: the whole scene moves; media: only the pictures move, inside their frames (layouts/media, a device screen, a bento tile)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    let half = clamp(Number(param(ctx, 'd')) * travel, 0, 160) / 2;
    const [ux, uy] = DIR[String(param(ctx, 'dir'))] ?? DIR.left;
    if (param(ctx, 'target') === 'media') {
      // Each half-sweep is at most 6 % of the picture along the sweep, and the picture is scaled by
      // 1 + 2 · half / that length, so the sweep never uncovers its frame.
      for (const m of pictures(camera)) {
        const len = ux !== 0 ? m.offsetWidth : m.offsetHeight, h = Math.min(half, 0.06 * len), k = (q - 0.5) * 2 * h;
        m.style.transformOrigin = '50% 50%';
        m.style.transform = `translate(${(-ux * k).toFixed(3)}px, ${(-uy * k).toFixed(3)}px) scale(${(1 + 2 * h / len).toFixed(5)})`;
      }
      return;
    }
    const box = extent(camera);
    if (box) {
      const m = safeOf(camera);
      const room = ux !== 0 ? Math.min(box.x0 - m, camera.offsetWidth - m - box.x1) : Math.min(box.y0 - m, camera.offsetHeight - m - box.y1);
      half = Math.min(half, Math.max(0, room));
    }
    const k = (q - 0.5) * 2 * half;
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = `translate(${(-ux * k).toFixed(3)}px, ${(-uy * k).toFixed(3)}px)`;
  },
};
export default MOVE;

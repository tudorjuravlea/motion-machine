// moves/pull-back: the camera starts close (scale `from`) and settles to 1, revealing the
// context around a detail. Rests exactly at identity at p = 1. Pure in p; scale bounded [1, 1.5]
// and capped so that no slot crosses the safe margin even at p = 0.
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
  name: 'pull-back',
  group: 'moves',
  params: {
    from: { type: 'number', default: 1.06, meaning: 'start scale before the style travel multiplier and the safe-margin cap (1.02 to 1.5)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    let start = 1 + clamp((clamp(Number(param(ctx, 'from')), 1.02, 1.5) - 1) * travel, 0, 0.5);
    const box = extent(camera);
    if (box) start = Math.max(1, Math.min(start, maxScale(box, camera.offsetWidth, camera.offsetHeight, safeOf(camera), camera.offsetWidth / 2, camera.offsetHeight / 2)));
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = q === 1 ? 'none' : `scale(${(1 + (start - 1) * (1 - q)).toFixed(5)})`;
  },
};
export default MOVE;

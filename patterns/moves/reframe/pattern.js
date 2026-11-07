// moves/reframe: the camera re-centres on a `data-focus` element while it pushes in a little.
// Pure in p. The scale is capped like push-in's, and the shift is clamped so that the slots stay
// inside the safe margin at every p; with no focus element it is a plain push-in. Reads layout
// offsets, never boxes that the camera transform itself has moved.
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

function centreIn(root, node) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
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
  name: 'reframe',
  group: 'moves',
  params: {
    focus: { type: 'string', default: '', meaning: 'name of the data-focus element to re-centre on; empty takes the first one' },
    to: { type: 'number', default: 1.12, meaning: 'end scale before the style travel multiplier and the safe-margin cap (1.02 to 1.4)' },
    amount: { type: 'number', default: 1, meaning: 'how much of the way to the frame centre the focus travels (0 to 1)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const W = camera.offsetWidth, H = camera.offsetHeight;
    let end = 1 + clamp((clamp(Number(param(ctx, 'to')), 1.02, 1.4) - 1) * travel, 0, 0.4);
    const box = extent(camera);
    const m = box ? safeOf(camera) : 0;
    if (box) end = Math.max(1, Math.min(end, maxScale(box, W, H, m, W / 2, H / 2)));
    const s = 1 + (end - 1) * q;
    const name = String(param(ctx, 'focus') || '');
    const node = camera.querySelector(name ? `[data-focus="${name}"]` : '[data-focus]');
    let tx = 0, ty = 0;
    if (node) {
      const c = centreIn(camera, node);
      const amount = clamp(Number(param(ctx, 'amount')), 0, 1);
      tx = -(c.x - W / 2) * s * amount * q;
      ty = -(c.y - H / 2) * s * amount * q;
      if (box) {
        // Keep the scaled union box inside [m, W - m] x [m, H - m]: tx and ty each have a legal range containing 0.
        const lo = (a, size, e0) => m - (size / 2 + s * (e0 - size / 2));
        const hi = (a, size, e1) => size - m - (size / 2 + s * (e1 - size / 2));
        tx = clamp(tx, lo(0, W, box.x0), hi(0, W, box.x1));
        ty = clamp(ty, lo(0, H, box.y0), hi(0, H, box.y1));
      }
    }
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = q === 0 ? 'none' : `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${s.toFixed(5)})`;
  },
};
export default MOVE;

// moves/push-in: the camera drifts toward the scene, scale 1 -> `to`, about the centre of the
// frame or about the centre of a `data-focus` element. Pure in p; p is clamped to [0, 1]. The end
// scale is bounded by [1, 1.5] after the style's travel multiplier and is capped so that no slot
// crosses the safe margin at any p (layouts leave about 8 % headroom for this). Runs on
// .mm-camera.
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

// Centre of `node` in `root`'s own coordinates, from layout offsets (transform-free).
function centreIn(root, node) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
}

// target = media: the move runs on every picture a pattern declares (an <img> or <video> with
// data-media and a src) inside the camera, each scaled about its own centre inside the frame that
// clips it, so the camera and the type stay put and no safe-margin cap applies.
const pictures = (camera) => [...camera.querySelectorAll('img[data-media][src], video[data-media][src]')].filter((m) => m.offsetWidth > 0 && m.offsetHeight > 0);

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
  name: 'push-in',
  group: 'moves',
  params: {
    to: { type: 'number', default: 1.06, meaning: 'end scale before the style travel multiplier and the safe-margin cap (1.02 to 1.5)' },
    focus: { type: 'string', default: '', meaning: 'name of a data-focus element to push toward; empty uses the frame centre' },
    target: { type: 'enum(camera|media)', default: 'camera', meaning: 'camera: the whole scene moves; media: only the pictures move, inside their frames (layouts/media, a device screen, a bento tile)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    let end = 1 + clamp((clamp(Number(param(ctx, 'to')), 1.02, 1.5) - 1) * travel, 0, 0.5);
    if (param(ctx, 'target') === 'media') {
      for (const m of pictures(camera)) {
        m.style.transformOrigin = '50% 50%';
        m.style.transform = q === 0 ? 'none' : `scale(${(1 + (end - 1) * q).toFixed(5)})`;
      }
      return;
    }
    let ox = camera.offsetWidth / 2, oy = camera.offsetHeight / 2;
    const name = String(param(ctx, 'focus') || '');
    const node = camera.querySelector(name ? `[data-focus="${name}"]` : '[data-focus]');
    if (node) ({ x: ox, y: oy } = centreIn(camera, node));
    const box = extent(camera);
    if (box) end = Math.max(1, Math.min(end, maxScale(box, camera.offsetWidth, camera.offsetHeight, safeOf(camera), ox, oy)));
    camera.style.transformOrigin = node ? `${ox.toFixed(2)}px ${oy.toFixed(2)}px` : '50% 50%';
    camera.style.transform = q === 0 ? 'none' : `scale(${(1 + (end - 1) * q).toFixed(5)})`;
  },
};
export default MOVE;

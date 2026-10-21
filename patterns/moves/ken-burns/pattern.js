// moves/ken-burns: the classic slow zoom with a sideways creep. Scale runs 1 -> `to`, where `to`
// is held in [1.03, 1.06] (references/pacing.md) and capped so that no slot crosses the safe
// margin; the creep is at most 1.5 % of the frame width, halved by the same cap. Pure in p.
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

const DIR = { left: -1, right: 1 };
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
  name: 'ken-burns',
  group: 'moves',
  params: {
    to: { type: 'number', default: 1.05, meaning: 'end scale, held in 1.03 to 1.06, then capped by the safe margin' },
    dir: { type: 'enum(left|right)', default: 'right', meaning: 'which way the camera creeps' },
    target: { type: 'enum(camera|media)', default: 'camera', meaning: 'camera: the whole scene moves; media: only the pictures move, inside their frames (layouts/media, a device screen, a bento tile)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    let end = 1 + clamp((clamp(Number(param(ctx, 'to')), 1.03, 1.06) - 1) * travel, 0, 0.06);
    if (param(ctx, 'target') === 'media') {
      // The picture starts scaled by 1 + 2c (c = the creep as a share of its width), so the creep
      // never uncovers its frame.
      const c = 0.015 * travel * 0.5, sign = DIR[String(param(ctx, 'dir'))] ?? 1;
      for (const m of pictures(camera)) {
        const tx = -sign * c * m.offsetWidth * (q - 0.5) * 2;
        m.style.transformOrigin = '50% 50%';
        m.style.transform = `translate(${tx.toFixed(3)}px, 0) scale(${((1 + (end - 1) * q) * (1 + 2 * c)).toFixed(5)})`;
      }
      return;
    }
    const W = camera.offsetWidth || 0;
    let creep = 0.015 * W * travel * 0.5;
    const box = extent(camera);
    if (box) {
      const m = safeOf(camera), H = camera.offsetHeight;
      end = Math.max(1, Math.min(end, maxScale(box, W, H, m, W / 2, H / 2)));
      creep = Math.min(creep, Math.max(0, Math.min(box.x0 - m, W - m - box.x1) - (end - 1) * Math.max(W / 2 - box.x0, box.x1 - W / 2)));
    }
    const tx = -(DIR[String(param(ctx, 'dir'))] ?? 1) * creep * (q - 0.5) * 2;
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = `translate(${tx.toFixed(3)}px, 0) scale(${(1 + (end - 1) * q).toFixed(5)})`;
  },
};
export default MOVE;

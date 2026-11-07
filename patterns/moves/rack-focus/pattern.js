// moves/rack-focus: focus travels from one depth plane to another. Every child carrying
// data-depth (0 near, 1 far) is blurred in proportion to its distance from the focal plane; the
// plane moves from `from` to `to` as p goes 0 -> 1. With rest = sharp (default) the blur is
// enveloped by sin(pi p), so the first and last frames are fully sharp and legible; rest = keep
// leaves off-plane layers soft at p = 1 (use it only on decorative layers). Pure in p; blur
// bounded [0, 16] px. Writes `filter` on the marked children, so those slots should not also use
// a blur entrance.
const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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
  name: 'rack-focus',
  group: 'moves',
  params: {
    from: { type: 'number', default: 0, meaning: 'focal depth at p = 0 (0 to 1)' },
    to: { type: 'number', default: 1, meaning: 'focal depth at p = 1 (0 to 1)' },
    rest: { type: 'enum(sharp|keep)', default: 'sharp', meaning: 'sharp: everything is in focus again at p = 1; keep: off-plane layers stay soft' },
    blur: { type: 'number', default: 8, meaning: 'px of blur one whole depth unit out of focus, before the style travel multiplier (0 to 16)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const f = Number(param(ctx, 'from')) * (1 - q) + Number(param(ctx, 'to')) * q;
    const env = String(param(ctx, 'rest')) === 'keep' ? 1 : Math.sin(Math.PI * q);
    const max = clamp(Number(param(ctx, 'blur')) * travel, 0, 16) * env;
    for (const el of camera.querySelectorAll('[data-depth]')) {
      const depth = clamp(Number(el.dataset.depth) || 0, 0, 1);
      const px = max * clamp(Math.abs(depth - f), 0, 1);
      el.style.filter = px < 0.05 ? 'none' : `blur(${px.toFixed(2)}px)`;
    }
  },
};
export default MOVE;

// moves/hero-drift: a slow hero shot. The camera floats in a shallow 3D drift (a small tilt about
// each axis, a vertical float, a breath of scale) and is back at identity at both ends.
// Ported in spirit from showcase's `float` and hero looks (MIT, same author): its amplitudes
// (4 and 2 degrees, 8 px float) are scaled down to a camera on flat layouts. Pure in p.
const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;

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
  name: 'hero-drift',
  group: 'moves',
  params: {
    tilt: { type: 'number', default: 1.2, meaning: 'peak tilt in degrees before the style travel multiplier (0 to 3)' },
    d: { type: 'number', default: 12, meaning: 'peak vertical float in px before the style travel multiplier (0 to 40)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const tilt = clamp(Number(param(ctx, 'tilt')) * travel, 0, 3);
    const d = clamp(Number(param(ctx, 'd')) * travel, 0, 40);
    const w = Math.sin(TAU * q);
    const ry = tilt * w;
    const rx = tilt * 0.5 * Math.sin(TAU * q + Math.PI / 2) - tilt * 0.5;
    const ty = d * Math.sin(TAU * q + Math.PI) ;
    const s = 1 + 0.02 * Math.sin(Math.PI * q);
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = `perspective(2400px) translate3d(0, ${ty.toFixed(3)}px, 0) rotateX(${rx.toFixed(4)}deg) rotateY(${ry.toFixed(4)}deg) scale(${s.toFixed(5)})`;
  },
};
export default MOVE;

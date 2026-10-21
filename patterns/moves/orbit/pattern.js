// moves/orbit: a gentle turn about the vertical axis that parallaxes the layers. Children that
// carry data-depth (a number, 1 = nearest) sit at their own depth; with none marked, the slots take
// depths 1, 0.5, 0.2 in document order. Flat at both ends (sin of p), no WebGL, no side effects
// outside the camera and its marked children. Writes `transform` on those children, so an
// entrance on a layered slot should use individual properties (translate, scale, opacity).
// Amplitudes follow showcase's orbit look (MIT, same author), scaled for a flat layout.
const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const LAYERS = [1, 0.5, 0.2];

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
  name: 'orbit',
  group: 'moves',
  params: {
    turn: { type: 'number', default: 5, meaning: 'peak turn in degrees before the style travel multiplier (0 to 10)' },
    gap: { type: 'number', default: 140, meaning: 'px of depth between the nearest and the furthest layer (0 to 400)' },
    end: { type: 'enum(scene|settle)', default: 'scene', meaning: 'scene: the move runs the whole scene; settle: it ends at the scene\'s settle instant (ctx.settle) and holds, so the rest is still' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(through(p, ctx)), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const turn = clamp(Number(param(ctx, 'turn')) * travel, 0, 10);
    const gap = clamp(Number(param(ctx, 'gap')), 0, 400);
    const a = turn * Math.sin(Math.PI * q);
    const b = turn * 0.3 * Math.sin(2 * Math.PI * q);
    camera.style.transformOrigin = '50% 50%';
    camera.style.transformStyle = 'preserve-3d';
    camera.style.transform = `perspective(2000px) rotateY(${a.toFixed(4)}deg) rotateX(${b.toFixed(4)}deg)`;
    let layers = [...camera.querySelectorAll('[data-depth]')];
    const marked = layers.length > 0;
    if (!marked) layers = [...camera.querySelectorAll('[data-slot]')];
    layers.forEach((el, i) => {
      const depth = marked ? clamp(Number(el.dataset.depth) || 0, -1, 1) : LAYERS[i % LAYERS.length];
      el.style.transform = `translateZ(${(depth * gap - gap / 2).toFixed(2)}px)`;
    });
  },
};
export default MOVE;

// moves/idle-breathe: an ambient swell so a held scene is alive, never a primary move. A whole
// number of sine cycles over the scene, so it is at identity at both ends. Amplitudes are capped
// at 20 % of a 1.06 push-in's travel (scale 0.012, float 6 px), SPEC W-AMBIENT. Pure in p.
const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;

const MOVE = {
  name: 'idle-breathe',
  group: 'moves',
  params: {
    amount: { type: 'number', default: 0.008, meaning: 'peak scale swing, capped at 0.012' },
    d: { type: 'number', default: 4, meaning: 'peak vertical float in px, capped at 6' },
    cycles: { type: 'number', default: 2, meaning: 'whole breaths over the scene (1 to 6)' },
  },
  at(camera, p, ctx) {
    const q = clamp(Number(p), 0, 1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const amount = clamp(Number(param(ctx, 'amount')) * travel, 0, 0.012);
    const d = clamp(Number(param(ctx, 'd')) * travel, 0, 6);
    const n = Math.round(clamp(Number(param(ctx, 'cycles')), 1, 6));
    const w = Math.sin(TAU * n * q);
    camera.style.transformOrigin = '50% 50%';
    camera.style.transform = `translate(0, ${(d * w).toFixed(3)}px) scale(${(1 + amount * w).toFixed(5)})`;
  },
};
export default MOVE;

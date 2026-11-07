// moves/explode-layers: perspective shift. Mid-scene the camera tilts back and turns a little while
// the scene's layers part in depth toward one vanishing point, like an exploded drawing of the
// layout; it holds there, then folds flat again before the scene ends. Layers are elements marked
// data-depth (1 = nearest) with unmarked slots nearest, else the slots from back to front. Flat at both ends
// of the scene; in a deck it writes nothing (every rest faces the viewer). Writes transform on the
// camera and on the layers, so an entrance on a layered slot should use individual properties.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);
const PART = [0.15, 0.42], FOLD = [0.7, 0.94];

const param = (ctx, k) => ctx?.params?.[k] ?? MOVE.params[k].default;
const MOVE = {
  name: 'explode-layers',
  group: 'moves',
  params: {
    tilt: { type: 'number', default: 22, meaning: 'how far the scene tips back at the peak, in degrees, before the style travel multiplier (8 to 35)' },
    gap: { type: 'number', default: 260, meaning: 'px of depth between the furthest and the nearest layer (80 to 500)' },
  },
  at(camera, p, ctx) {
    // marked layers keep their depth and unmarked slots float nearest (a headline over its tiles);
    // with nothing marked, the slots spread from back to front in document order. An empty slot is
    // not a layer (the kit does not restore it).
    const marked = camera.querySelector('[data-depth]:not([data-empty])') != null;
    const layers = [...new Set([...camera.querySelectorAll('[data-depth]'), ...camera.querySelectorAll('[data-slot]')])].filter((s) => s.offsetWidth > 0 && !s.matches('[data-empty]'));
    // the wrappers between the camera and the layers: the kit restores the camera and the slots but
    // not these, so every call sets or clears them, and the same t always draws the same frame
    const wrappers = new Set();
    for (const l of layers) for (let n = l.parentElement; n && n !== camera; n = n.parentElement) wrappers.add(n);
    const q = ctx?.u != null && ctx.d > 0 ? clamp(ctx.u / ctx.d, 0, 1) : clamp(Number(p), 0, 1);   // the scene's own clock
    const k = ctx?.deck ? 0 : q < PART[1] ? smooth(clamp((q - PART[0]) / (PART[1] - PART[0]), 0, 1)) : q < FOLD[0] ? 1 : 1 - smooth(clamp((q - FOLD[0]) / (FOLD[1] - FOLD[0]), 0, 1));
    for (const w of wrappers) w.style.transformStyle = k > 1e-4 ? 'preserve-3d' : '';
    if (k <= 1e-4) return;
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const tilt = clamp(Number(param(ctx, 'tilt')) * travel, 8, 35) * k;
    const gap = clamp(Number(param(ctx, 'gap')), 80, 500) * k;
    camera.style.transformOrigin = '50% 60%';
    camera.style.transformStyle = 'preserve-3d';
    // tip back, turn a third as much, and shrink a touch so the parted layers stay in frame
    camera.style.transform = `perspective(1800px) rotateX(${tilt.toFixed(3)}deg) rotateZ(${(-tilt / 3).toFixed(3)}deg) scale(${(1 - 0.12 * k).toFixed(4)})`;
    const n = layers.length;
    layers.forEach((el, i) => {
      const depth = el.dataset.depth != null ? clamp(Number(el.dataset.depth) || 0, -1, 1) : marked ? 1 : n > 1 ? i / (n - 1) : 0.5;
      el.style.transformStyle = 'preserve-3d';
      el.style.transform = `translateZ(${(depth * gap - gap / 2).toFixed(2)}px)`;
    });
  },
};
export default MOVE;

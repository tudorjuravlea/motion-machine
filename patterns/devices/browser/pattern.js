// devices/browser: a generic window that settles in with a small scale and lift. The slot's text
// becomes the page title. Upright and flat at p = 1. Pure in p; scale held in [0.9, 1.1].
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const DEVICE = {
  name: 'browser',
  group: 'devices',
  fragment: true,   // the kit instantiates pattern.html (so a beat's asset is on the screen and decoded before the first seek) and fills the screen title with the beat's text
  params: {
    from: { type: 'number', default: 0.94, meaning: 'scale at p = 0 (0.9 to 1)' },
    d: { type: 'number', default: 40, meaning: 'px the window rises from, before the style travel multiplier' },
    size: { type: 'enum(regular|large)', default: 'regular', meaning: 'regular: as tall as 0.58 of the frame height allows; large: 0.74 (CSS on data-p-size, width capped at 0.86 of the frame)' },
  },
  at(el, p, ctx) {
    const root = el.querySelector(':scope > [data-device]');
    if (!root) return;   // the kit warns when pattern.html is missing
    const q = clamp(Number(p), 0, 1.1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const from = clamp(Number(ctx?.params?.from ?? DEVICE.params.from.default), 0.9, 1);
    const d = clamp(Number(ctx?.params?.d ?? DEVICE.params.d.default) * travel, 0, 160);
    el.style.opacity = String(clamp(p / 0.5, 0, 1));
    root.style.transformOrigin = '50% 50%';
    root.style.transform = p === 1 ? 'none'
      : `translateY(${((1 - q) * d).toFixed(3)}px) scale(${(from + (1 - from) * q).toFixed(5)})`;
  },
};
export default DEVICE;

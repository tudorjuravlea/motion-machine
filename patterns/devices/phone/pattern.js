// devices/phone: a generic handset that rises into frame with a settling tilt. The slot's own text
// becomes the screen title; the kit instantiates the shell from pattern.html. At p = 1 the device is upright and flat. Pure in p: the
// kit restores the slot before every seek, so nothing here survives from one instant to the next.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const DEVICE = {
  name: 'phone',
  group: 'devices',
  fragment: true,   // the kit instantiates pattern.html and fills the screen with the beat's text
  params: {
    tilt: { type: 'number', default: 24, meaning: 'degrees of turn about the vertical axis at p = 0 (0 to 45)' },
    d: { type: 'number', default: 80, meaning: 'px the device rises from, before the style travel multiplier' },
    size: { type: 'enum(regular|large)', default: 'regular', meaning: 'regular: 0.6 of the frame height; large: 0.74 (CSS on data-p-size, width capped at 0.86 of the frame)' },
    model: { type: 'enum(island|punch|notch|plain)', default: 'island', meaning: 'the cutout at the top of the screen: a floating island with its lens, a round camera dot (punch, a wider slab with its keys on one side), a notch on the edge, or none (CSS on data-p-model)' },
    statusTime: { type: 'string', default: '10:00', meaning: 'the time in the status bar' },
    frame: { type: 'string', default: '', meaning: 'your own device frame image, as written by mm media frame (assets/frames/<n>, no extension): the screen fills its hole and the built-in shell steps aside' },
    status: { type: 'enum(auto|true|false)', default: 'auto', meaning: 'the status bar (time, signal, wifi, battery): auto shows it on a bare phone only, since a picture or recording carries its own (CSS on data-p-status)' },
  },
  at(el, p, ctx) {
    const root = el.querySelector(':scope > [data-device]');
    if (!root) return;   // the kit warns when pattern.html is missing
    const q = clamp(Number(p), 0, 1.1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const tilt = clamp(Number(ctx?.params?.tilt ?? DEVICE.params.tilt.default), 0, 45);
    const d = clamp(Number(ctx?.params?.d ?? DEVICE.params.d.default) * travel, 0, 240);
    const time = root.querySelector('.phone__time');
    if (time) time.textContent = String(ctx?.params?.statusTime ?? DEVICE.params.statusTime.default);
    el.style.opacity = String(clamp(p / 0.5, 0, 1));
    root.style.transformOrigin = '50% 60%';
    root.style.transform = p === 1 ? 'none'
      : `perspective(1800px) translateY(${((1 - q) * d).toFixed(3)}px) rotateY(${((1 - q) * tilt).toFixed(4)}deg)`;
  },
};
export default DEVICE;

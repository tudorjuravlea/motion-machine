// devices/laptop: a generic notebook whose lid opens as p runs 0 -> 1, then rests fully open
// and flat. The slot's text becomes the screen title. Pure in p; the lid angle is bounded [0, 90].
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const DEVICE = {
  name: 'laptop',
  group: 'devices',
  fragment: true,   // the kit instantiates pattern.html (so a beat's asset is on the screen and decoded before the first seek) and fills the screen title with the beat's text
  params: {
    open: { type: 'number', default: 80, meaning: 'degrees the lid is tipped back at p = 0 (0 to 90)' },
    size: { type: 'enum(regular|large)', default: 'regular', meaning: 'regular: as tall as 0.58 of the frame height allows; large: 0.74 (CSS on data-p-size, width capped at 0.86 of the frame)' },
    frame: { type: 'string', default: '', meaning: 'your own device frame image, as written by mm media frame (assets/frames/<n>, no extension): the screen fills its hole and the built-in shell steps aside' },
    model: { type: 'enum(notch|chin|plain)', default: 'notch', meaning: 'a camera notch at the top of the lid; chin, the earlier face with a deeper top bezel, a small round camera and a chin; or none (CSS on data-p-model)' },
    menu: { type: 'string', default: '', meaning: 'a menu bar across the top of the screen: up to 5 comma-separated items; more are dropped' },
  },
  at(el, p, ctx) {
    const root = el.querySelector(':scope > [data-device]');
    if (!root) return;   // the kit warns when pattern.html is missing
    const q = clamp(Number(p), 0, 1.1);
    const open = clamp(Number(ctx?.params?.open ?? DEVICE.params.open.default), 0, 90);
    const lid = root.querySelector('.laptop__lid');
    const menu = root.querySelector('.laptop__menu');
    if (menu) {
      const items = String(ctx?.params?.menu ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
      menu.textContent = '';
      for (const label of items) { const i = document.createElement('span'); i.className = 'laptop__menu-item'; i.dataset.micro = ''; i.textContent = label; menu.append(i); }
    }
    el.style.opacity = String(clamp(p / 0.3, 0, 1));
    // with your own frame image the lid is a picture and does not open
    lid.style.transform = p === 1 || el.hasAttribute('data-frame') ? 'none' : `rotateX(${(clamp(1 - q, 0, 1) * open).toFixed(4)}deg)`;
    lid.style.opacity = String(clamp(0.35 + 0.65 * q, 0, 1));
  },
};
export default DEVICE;

// devices/screen-zoom: a framed screen that comes closer, bezel and all, until the whole device fills
// the safe box of the frame at p = 1 (contain-fit, so nothing crosses the safe margin). The picture on
// the screen is never magnified on its own and the screen is never shown without its device. The slot's
// text becomes the screen title and grows with the device. Pure in p: the device's rest geometry is read
// from layout offsets, which the transform never changes.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => t * t * (3 - 2 * t);

const MARKUP = '<div class="screen-zoom" data-device="screen-zoom"><div class="screen-zoom__frame"><div class="screen-zoom__bezel"></div><div class="screen-zoom__screen"><div class="screen-zoom__bar"></div><div class="screen-zoom__label" data-slot="screen"></div><div class="screen-zoom__row"></div><div class="screen-zoom__row screen-zoom__row--short"></div></div></div></div>';

function build(el) {
  let root = el.querySelector(':scope > [data-device]');
  if (!root) {
    const label = el.textContent.trim();
    el.textContent = '';
    el.insertAdjacentHTML('beforeend', MARKUP);
    root = el.firstElementChild;
    root.querySelector('[data-slot="screen"]').textContent = label;
  }
  return root;
}

// Centre of `node` in `root`'s coordinates, from layout offsets (transform-free).
function centreIn(root, node) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
}

const DEVICE = {
  name: 'screen-zoom',
  group: 'devices',
  params: {},
  at(el, p) {
    const root = build(el);
    const q = clamp(Number(p), 0, 1);
    const frame = root.querySelector('.screen-zoom__frame');
    const stage = el.closest('.mm-stage') || el.ownerDocument.documentElement;
    const W = stage.offsetWidth || el.ownerDocument.documentElement.clientWidth;
    const H = stage.offsetHeight || el.ownerDocument.documentElement.clientHeight;
    const safe = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el.ownerDocument.documentElement).getPropertyValue('--mm-safe')) || 0;
    const fw = frame.offsetWidth, fh = frame.offsetHeight;
    const S = Math.max(1, Math.min((W - 2 * safe) / fw, (H - 2 * safe) / fh));
    const s = Math.pow(S, smooth(q));
    const f = S > 1 ? (s - 1) / (S - 1) : 0;
    const c = centreIn(stage, frame);
    const tx = (W / 2 - c.x) * f, ty = (H / 2 - c.y) * f;
    el.style.opacity = String(clamp(p / 0.2, 0, 1));
    frame.style.transformOrigin = '50% 50%';
    frame.style.transform = q === 0 ? 'none' : `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${s.toFixed(5)})`;
  },
};
export default DEVICE;

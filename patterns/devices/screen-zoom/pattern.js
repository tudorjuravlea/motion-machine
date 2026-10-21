// devices/screen-zoom: a framed screen whose content scales until the screen fills the safe box
// of the frame at p = 1 (contain-fit, so nothing crosses the safe margin); the bezel fades out over
// the last third. The slot's text becomes the screen title and scales with it. Pure in p: the
// screen's rest geometry is read from layout offsets, which the zoom transform never changes.
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
    const screen = root.querySelector('.screen-zoom__screen');
    const stage = el.closest('.mm-stage') || el.ownerDocument.documentElement;
    const W = stage.offsetWidth || el.ownerDocument.documentElement.clientWidth;
    const H = stage.offsetHeight || el.ownerDocument.documentElement.clientHeight;
    const safe = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el.ownerDocument.documentElement).getPropertyValue('--mm-safe')) || 0;
    const sw = screen.offsetWidth, sh = screen.offsetHeight;
    const S = Math.max(1, Math.min((W - 2 * safe) / sw, (H - 2 * safe) / sh));
    const s = Math.pow(S, q);
    const f = S > 1 ? (s - 1) / (S - 1) : 0;
    const c = centreIn(stage, screen);
    const o = centreIn(frame, screen);
    const tx = (W / 2 - c.x) * f, ty = (H / 2 - c.y) * f;
    el.style.opacity = String(clamp(p / 0.2, 0, 1));
    frame.style.transformOrigin = `${o.x.toFixed(2)}px ${o.y.toFixed(2)}px`;
    frame.style.transform = q === 0 ? 'none' : `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${s.toFixed(5)})`;
    root.querySelector('.screen-zoom__bezel').style.opacity = String((1 - smooth(clamp((q - 0.65) / 0.35, 0, 1))).toFixed(4));
  },
};
export default DEVICE;

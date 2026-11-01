// devices/demo-frame: a recording shown on the brand's ground, with no device around it: a plane of the recording's own
// shape, held inside the frame by a padding that takes up to 40 % of it, a rounded mask, and a three-layer shadow in one
// palette role that follows the silhouette (so it follows the plane when screen/zoom-to leans it). Every measure is a
// fraction of the frame or a page pixel (1080 on the short side in every format), so the look holds at 9x16, 1x1 and
// 16x9. It settles in with a small scale and lift like the other devices. The lean itself is screen/zoom-to's: it sets
// the transform of the element marked data-tilt-plane.
import { paddingScale, shadowCss } from '../../../runtime/kit/demoframe.js';
import { contentMeta } from '../../../runtime/kit/screen.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

/** The shape of the recording on the screen: width over height, from its media.json; a picture's own size; else `fallback`. */
function ratioOf(root, ratio, fallback) {
  const r = String(ratio ?? 'auto').trim();
  const pair = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(r);
  if (pair) return Number(pair[1]) / Number(pair[2]);
  if (r !== 'auto' && Number(r) > 0) return Number(r);
  const content = root.querySelector('.mm-screen__content');
  const meta = content ? contentMeta.get(content) : null;
  if (meta?.kind === 'sequence' && meta.w > 0 && meta.h > 0) return meta.w / meta.h;
  if (meta?.kind === 'page' && meta.viewport?.w > 0 && meta.viewport?.h > 0) return meta.viewport.w / meta.viewport.h;
  const img = root.querySelector('.demo-frame__media[src]');
  if (img?.naturalWidth > 0 && img?.naturalHeight > 0) return img.naturalWidth / img.naturalHeight;
  return fallback;
}

const DEVICE = {
  name: 'demo-frame',
  group: 'devices',
  fragment: true,   // the kit instantiates pattern.html, so a beat's asset is on the screen and decoded before the first seek
  params: {
    padding: { type: 'number', default: 0.5, meaning: 'the share of the frame left round the recording: 0 fills it, 1 leaves 0.6 of it (0 to 1)' },
    radius: { type: 'number', default: 0.03, meaning: 'the corner of the mask, as a share of the recording\'s short side (0 to 0.2)' },
    shadow: { type: 'number', default: 0.7, meaning: 'the shadow\'s strength: three layers that grow together (0 to 1)' },
    shadowRole: { type: 'enum(canvas|ink|muted|surface|line|accent|accentInk)', default: 'ink', meaning: 'the palette role the shadow is a tint of' },
    ratio: { type: 'string', default: 'auto', meaning: 'the shape of the recording, "w:h" or a number; auto reads it from the asset' },
    from: { type: 'number', default: 0.94, meaning: 'scale at p = 0 (0.9 to 1)' },
    d: { type: 'number', default: 40, meaning: 'px the frame rises from, before the style travel multiplier' },
  },
  at(el, p, ctx) {
    const root = el.querySelector(':scope > [data-device]');
    if (!root) return;   // the kit warns when pattern.html is missing
    const prm = ctx?.params ?? {};
    const q = clamp(Number(p), 0, 1.1);
    const travel = Number(ctx?.style?.motion?.travel ?? 1);
    const from = clamp(num(prm.from, DEVICE.params.from.default), 0.9, 1);
    const d = clamp(num(prm.d, DEVICE.params.d.default) * travel, 0, 160);
    root.style.setProperty('--demo-fit', String(paddingScale(num(prm.padding, DEVICE.params.padding.default))));
    root.style.setProperty('--demo-ratio', String(ratioOf(root, prm.ratio, 1.6)));
    const plane = root.querySelector('.demo-frame__plane');
    plane.style.borderRadius = `${Math.round(clamp(num(prm.radius, DEVICE.params.radius.default), 0, 0.2) * Math.min(plane.offsetWidth, plane.offsetHeight) * 100) / 100}px`;
    root.querySelector('.demo-frame__shadow').style.filter = shadowCss(num(prm.shadow, DEVICE.params.shadow.default), prm.shadowRole);
    el.style.opacity = String(clamp(p / 0.5, 0, 1));
    root.style.transformOrigin = '50% 50%';
    root.style.transform = p === 1 ? 'none' : `translateY(${((1 - q) * d).toFixed(3)}px) scale(${(from + (1 - from) * q).toFixed(5)})`;
  },
};
export default DEVICE;

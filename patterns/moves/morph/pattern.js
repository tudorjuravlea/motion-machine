// moves/morph: inside a scene one box becomes another (a button into a player, a card into a
// workspace). A box travels from the `from` slot's rect to the `to` slot's rect, its left and width
// on the ui spring and its top and height on the heavier one, so it stretches before it deepens; a
// dashed ghost stays at the origin while it moves. `from`'s content fades out over the first
// quarter, `to`'s fades in from 55 %. Before the morph only `from` shows; after it only `to`, and the
// overlay is gone. Rects come from layout offsets (transform-free); the overlay is drawn fresh on
// every seek (data-mm-overlay). It sets its slots' opacity, so the kit runs it after the entrances.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r2 = (x) => Math.round(x * 100) / 100;

function rectIn(root, node) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

export default {
  name: 'morph',
  group: 'moves',
  dur: 'slow',
  afterItems: true,
  params: {
    from: { type: 'string', default: '', meaning: 'the slot the box starts on' },
    to: { type: 'string', default: '', meaning: 'the slot the box becomes' },
    start: { type: 'number', default: 0.6, meaning: 'seconds into the scene when the morph begins' },
    dur: { type: 'number', default: 1.2, meaning: 'seconds the morph lasts' },
  },
  at(camera, p, ctx) {
    const prm = ctx.params ?? {};
    const from = prm.from && camera.querySelector(`[data-slot="${prm.from}"]`);
    const to = prm.to && camera.querySelector(`[data-slot="${prm.to}"]`);
    if (!from || !to) return;
    const dur = Math.max(0.1, Number(prm.dur) || 1.2);
    const q = ctx.u != null ? clamp01((ctx.u - (Number(prm.start) || 0)) / dur) : clamp01(p);
    from.style.opacity = String(Math.round((1 - clamp01(q / 0.25)) * 1000) / 1000);
    to.style.opacity = String(Math.round(clamp01((q - 0.55) / 0.45) * 1000) / 1000);
    if (q <= 0 || q >= 1) return;
    const a = rectIn(camera, from), b = rectIn(camera, to);
    const u = q * dur;
    const ex = ctx.spring(u, 'ui'), ey = ctx.spring(u, 'heavy');
    const lerp = (m, n, e) => m + (n - m) * e;
    const doc = camera.ownerDocument;
    const layer = doc.createElement('div');
    layer.className = 'mm-morph';
    layer.setAttribute('data-mm-overlay', '');
    layer.innerHTML = '<i class="mm-morph__ghost"></i><i class="mm-morph__box"></i>';
    const place = (el, r) => { el.style.left = `${r2(r.x)}px`; el.style.top = `${r2(r.y)}px`; el.style.width = `${r2(r.w)}px`; el.style.height = `${r2(r.h)}px`; };
    place(layer.firstChild, a);
    place(layer.lastChild, { x: lerp(a.x, b.x, ex), y: lerp(a.y, b.y, ey), w: lerp(a.w, b.w, ex), h: lerp(a.h, b.h, ey) });
    layer.firstChild.style.opacity = String(Math.round(0.35 * (1 - clamp01((q - 0.7) / 0.3)) * 1000) / 1000);
    layer.lastChild.style.opacity = String(Math.round((1 - clamp01((q - 0.55) / 0.45)) * 1000) / 1000);
    camera.append(layer);
  },
};

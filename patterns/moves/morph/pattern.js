// moves/morph: inside a scene one thing becomes another. Two modes.
//
// box (the default): a box travels from the `from` slot's rect to the `to` slot's rect (a button into a
// player, a card into a workspace), its left and width on the ui spring and its top and height on the
// heavier one, so it stretches before it deepens; a dashed ghost stays at the origin while it moves.
//
// path: a shape becomes a shape (a logo into a logo, an icon into an icon). The shapes are read from the
// slots (an inline <svg>, or a beat's SVG asset) or given as path data (`fromPath`, `toPath`); the
// correspondence between them is worked out once (runtime/kit/morph.js) and each frame is the blend of
// it at the move's progress. Drawn in one palette role.
//
// In both modes before the morph only `from` shows; after it only `to`. Rects come from layout offsets
// (transform-free); the overlay is drawn fresh on every seek (data-mm-overlay). It sets its slots'
// opacity, so the kit runs it after the entrances.
import { parse, shape, bbox, fit } from '../../../runtime/kit/pathkit.js';
import { plan, sampleD, shares } from '../../../runtime/kit/morph.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => String(Math.round(x * 1000) / 1000);

function rectIn(root, node) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

// ---------------------------------------------------------------------------------------------
// path mode: where the shapes come from

const SHAPE_TAGS = 'path, circle, ellipse, rect, line, polyline, polygon';
const PLANS = new Map();    // a pair of shapes laid into the frame, with the options that decide the plan -> its plan
const ASSETS = new Map();   // an SVG's address -> its shapes (or the fetch on its way)

function warn(doc, msg) { const w = doc.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }

/** A drawing's shapes as one path and the box it is drawn in: from an <svg> element (live or parsed). */
function readSvg(svg, doc) {
  const subs = [];
  let flat = true;
  for (const el of svg.querySelectorAll(SHAPE_TAGS)) {
    if (el.closest('defs, clipPath, mask, symbol, pattern')) continue;
    if (el.hasAttribute('transform') || el.parentElement?.closest('[transform]')) flat = false;
    const a = {};
    for (const at of el.attributes) a[at.name] = at.value;
    const p = el.localName === 'path' ? parse(a.d) : shape(el.localName, a);
    subs.push(...p.subs);
  }
  const path = { subs };
  if (!flat) warn(doc, 'moves/morph: a shape carries a transform, which the morph does not apply; flatten it in the drawing tool');
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let view = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] } : null;
  if (!view) { const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height')); view = w > 0 && h > 0 ? { x: 0, y: 0, w, h } : bbox(path); }
  return { path, view };
}

function assetFor(url, doc) {
  const hit = ASSETS.get(url);
  if (hit) return hit;
  const entry = { shapes: null, wait: null };
  entry.wait = fetch(url).then((r) => (r.ok ? r.text() : '')).then((t) => {
    const svg = t ? new doc.defaultView.DOMParser().parseFromString(t, 'image/svg+xml').documentElement : null;
    entry.shapes = svg && svg.localName === 'svg' ? readSvg(svg, doc) : { path: { subs: [] }, view: null };
  }, () => { entry.shapes = { path: { subs: [] }, view: null }; });
  ASSETS.set(url, entry);
  return entry;
}

const place = (camera, el) => {      // the box of an element in the camera's own pixels, even for an <svg> (which has no offsets)
  const c = camera.getBoundingClientRect(), r = el.getBoundingClientRect();
  const s = c.width / (camera.offsetWidth || 1) || 1;
  return { x: (r.left - c.left) / s, y: (r.top - c.top) / s, w: r.width / s, h: r.height / s };
};

/**
 * One end of the morph: the shape laid into the frame, `shown` when the pattern must draw it at rest (it was
 * given as path data, so nothing else draws it) and `wait`, a promise of the asset still on its way.
 */
function endOf(camera, slot, d, doc) {
  const box = rectIn(camera, slot);
  if (d) {
    const path = parse(d), b = bbox(path);
    return b ? { path: fit(path, b, box), shown: true } : { path, shown: true };
  }
  const svg = slot.matches('svg') ? slot : slot.querySelector('svg');
  if (svg) {
    const { path, view } = readSvg(svg, doc);
    return view ? { path: fit(path, view, place(camera, svg)), shown: false } : { path, shown: false };
  }
  const src = slot.getAttribute('data-asset') || slot.closest('[data-asset]')?.getAttribute('data-asset');
  if (src && /\.svg$/i.test(src)) {
    const entry = assetFor(new URL(src, doc.baseURI).href, doc);
    const holder = slot.querySelector('img') || slot;
    if (!entry.shapes) return { wait: entry.wait };
    // a slot that holds no picture of its own has nothing to show the asset: the overlay draws it, at rest too
    const shown = !slot.querySelector('img, svg');
    return entry.shapes.view ? { path: fit(entry.shapes.path, entry.shapes.view, place(camera, holder)), shown } : { path: { subs: [] }, shown };
  }
  return { path: { subs: [] }, shown: false };
}

function pathMorph(camera, p, ctx, prm) {
  const doc = camera.ownerDocument;
  const from = prm.from && camera.querySelector(`[data-slot="${prm.from}"]`);
  const to = prm.to && camera.querySelector(`[data-slot="${prm.to}"]`);
  if (!from || !to) return;
  const dur = Math.max(0.1, Number(prm.dur) || 1.2);
  const raw = ctx.u != null ? clamp01((ctx.u - (Number(prm.start) || 0)) / dur) : clamp01(p);
  const q = ctx.ease('move', raw);
  const a = endOf(camera, from, prm.fromPath, doc), b = endOf(camera, to, prm.toPath, doc);
  const go = () => {
    const A = a.wait ? endOf(camera, from, prm.fromPath, doc) : a, B = b.wait ? endOf(camera, to, prm.toPath, doc) : b;
    if (A.wait || B.wait) return;
    // an end given as path data is drawn by the pattern, at rest too; an end the slot draws is handed over to the overlay
    const inFade = A.shown ? 1 : clamp01(raw / 0.08), outFade = B.shown ? 1 : clamp01((1 - raw) / 0.08);
    if (!A.shown) from.style.opacity = r3(1 - inFade);
    if (!B.shown) to.style.opacity = r3(1 - outFade);
    if (!(inFade * outFade > 0)) return;
    const key = [JSON.stringify(A.path), JSON.stringify(B.path), prm.smoothing, prm.rotate, prm.origin, prm.originTo].join('|');
    let pl = PLANS.get(key);
    if (!pl) {
      pl = plan(A.path, B.path, {
        smoothing: Math.max(0, Number(prm.smoothing) || 0), rotate: prm.rotate === true || prm.rotate === 'true',
        origin: shares(prm.origin), originTo: prm.originTo ? shares(prm.originTo) : null,
      });
      PLANS.set(key, pl);
    }
    const layer = doc.createElement('div');
    layer.className = 'mm-morph';
    layer.setAttribute('data-mm-overlay', '');
    layer.setAttribute('data-ink', ['ink', 'accent', 'muted', 'surface'].includes(prm.ink) ? prm.ink : 'ink');
    layer.setAttribute('data-render', prm.render === 'outline' ? 'outline' : 'fill');
    layer.style.setProperty('--mm-morph-weight', r3(Math.min(0.03, Math.max(0.001, Number(prm.weight) || 0.006))));
    const W = camera.offsetWidth, H = camera.offsetHeight;
    layer.innerHTML = `<svg class="mm-morph__shape" viewBox="0 0 ${r2(W)} ${r2(H)}" aria-hidden="true"><path d="${sampleD(pl, q)}" fill-rule="${prm.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'}"/></svg>`;
    layer.firstChild.style.opacity = r3(inFade * outFade);
    camera.append(layer);
  };
  if (a.wait || b.wait) { ctx.afterSettle(() => Promise.all([a.wait, b.wait].filter(Boolean)).then(go)); return; }
  go();
}

const params = {
  from: { type: 'string', default: '', meaning: 'the slot the box starts on' },
  to: { type: 'string', default: '', meaning: 'the slot the box becomes' },
  start: { type: 'number', default: 0.6, meaning: 'seconds into the scene when the morph begins' },
  dur: { type: 'number', default: 1.2, meaning: 'seconds the morph lasts' },
  mode: { type: 'enum(box|path)', default: 'box', meaning: 'box: one box becomes another; path: one shape becomes another' },
  fromPath: { type: 'string', default: '', meaning: 'path mode: path data for the first shape; empty reads the `from` slot\'s <svg> or SVG asset' },
  toPath: { type: 'string', default: '', meaning: 'path mode: path data for the second shape; empty reads the `to` slot' },
  smoothing: { type: 'number', default: 0.04, meaning: 'path mode: one anchor per this share of a shape\'s diagonal, evenly spaced between corners (0 keeps each shape\'s own anchors)' },
  rotate: { type: 'boolean', default: false, meaning: 'path mode: turn about an origin instead of blending straight across, without folding' },
  origin: { type: 'string', default: '50% 50%', meaning: 'path mode, rotate: the point the first shape turns about, as shares of its box ("50% 50%", "left top")' },
  originTo: { type: 'string', default: '', meaning: 'path mode, rotate: the same for the second shape; empty is the same shares of its box' },
  ink: { type: 'enum(ink|accent|muted|surface)', default: 'ink', meaning: 'path mode: the palette role the shape is drawn in' },
  render: { type: 'enum(fill|outline)', default: 'fill', meaning: 'path mode: a filled shape or its outline' },
  weight: { type: 'number', default: 0.006, meaning: 'path mode, outline: the line\'s weight as a share of the frame\'s short side' },
  fillRule: { type: 'enum(nonzero|evenodd)', default: 'nonzero', meaning: 'path mode: how counters are cut out of a filled shape' },
};

export default {
  name: 'morph',
  group: 'moves',
  dur: 'slow',
  afterItems: true,
  params,
  at(camera, p, ctx) {
    const prm = ctx.params ?? {};
    if (prm.mode === 'path') { pathMorph(camera, p, ctx, prm); return; }
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
    const placeEl = (el, r) => { el.style.left = `${r2(r.x)}px`; el.style.top = `${r2(r.y)}px`; el.style.width = `${r2(r.w)}px`; el.style.height = `${r2(r.h)}px`; };
    placeEl(layer.firstChild, a);
    placeEl(layer.lastChild, { x: lerp(a.x, b.x, ex), y: lerp(a.y, b.y, ey), w: lerp(a.w, b.w, ex), h: lerp(a.h, b.h, ey) });
    layer.firstChild.style.opacity = String(Math.round(0.35 * (1 - clamp01((q - 0.7) / 0.3)) * 1000) / 1000);
    layer.lastChild.style.opacity = String(Math.round((1 - clamp01((q - 0.55) / 0.45)) * 1000) / 1000);
    camera.append(layer);
  },
};

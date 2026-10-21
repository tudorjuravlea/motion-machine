// entrances/sketch: the slot is drawn as a wireframe by a pen. The outline goes on in one steady
// stroke that goes over itself (runtime/kit/rough.js), the label arrives as the pen closes, and at
// rest the line shivers on the kit's boil clock (ctx.boil), still in a deck. The slot's own fill,
// border and pictures are off while it is a sketch (pattern.css); the label stays in the brand face,
// in ink. transitions/sketch-to-ink inks it: it writes --mm-tx-ink (0 to 1) and --mm-tx-ink-to (the
// finished slot, "scene/slot") on the slot before the slot is drawn; this pattern measures that
// slot when it draws (after the camera moves have run) and straightens, moves and lifts the stroke.
import { shapeOf, planOf, stroke, lerpBox, STEP, INK } from '../../../runtime/kit/rough.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pen = (x) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;   // a pen travels steadily with soft ends, unlike UI that decelerates
const r3 = (x) => String(Math.round(x * 1000) / 1000);

const DRAW = 0.75;        // the outline is drawn over the first 75 % of the entrance
const LABEL = 0.5;        // the label fades in from half-way, so it lands as the pen closes
const BOIL = 0.45;        // the shiver, in pen half-widths: about 0.3 of the base wander, as drawably draws at video size
const REACH = 1.5 * 1.4;  // rough.js's furthest wander per unit of roughness, in pen half-widths (its second pass)

const SHAPES = ['box', 'pill', 'circle', 'line'];
const params = {
  shape: { type: 'enum(box|pill|circle|line)', default: 'box', meaning: 'box follows the slot\'s own corner radius; pill rounds the ends; circle the inscribed ellipse; line a rule along the bottom (a field, a divider)' },
  roughness: { type: 'number', default: 1, meaning: 'how far the pen wanders, 0 (a ruled line) to 2 (a quick scrawl)' },
};

function radiusOf(el, w, h) {
  const v = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(v) || 0;
  return /%$/.test(v) ? (n / 100) * Math.min(w, h) : n;
}

// words that are this slot's own, not a slot nested inside it (a desk's menu bar is its own slot)
function ownWords(el) {
  const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const host = n.parentElement?.closest('[data-slot]');
    if (/\S/.test(n.data) && (!host || host === el || !el.contains(host))) return true;
  }
  return false;
}

// the finished slot sketch-to-ink names ("scene/slot"), read from this slot or, for a cascade's
// child, from its slot; null when there is none or it is empty
function partnerOf(slot) {
  const ref = slot.style.getPropertyValue('--mm-tx-ink-to').trim();
  const cut = ref.indexOf('/');
  if (cut < 1) return null;
  const el = slot.ownerDocument.querySelector(`[data-scene="${CSS.escape(ref.slice(0, cut))}"] [data-slot="${CSS.escape(ref.slice(cut + 1))}"]`);
  return el && !el.hasAttribute('data-empty') && el.offsetWidth ? el : null;
}

// the partner's border box in this element's padding-box px, measured on screen now
function boxOn(el, partner) {
  const ra = el.getBoundingClientRect(), rb = partner.getBoundingClientRect();
  const s = ra.width / (el.offsetWidth || 1) || 1;
  const x0 = ra.left + el.clientLeft * s, y0 = ra.top + el.clientTop * s;
  const k = rb.width / (partner.offsetWidth || 1) || 1;
  return { x: (rb.left - x0) / s, y: (rb.top - y0) / s, w: rb.width / s, h: rb.height / s, r: (radiusOf(partner, partner.offsetWidth, partner.offsetHeight) * k) / s };
}

export default {
  name: 'sketch',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    if (p <= 0) return;
    // the padding box: an absolute child's frame (a border sits outside it)
    const w = el.clientWidth || el.offsetWidth, h = el.clientHeight || el.offsetHeight;
    if (!w || !h) return;
    const slot = el.hasAttribute('data-slot') ? el : el.closest('[data-slot]') ?? el;   // a cascade's child draws for its slot
    const q = ctx.d > 0 && ctx.u != null ? clamp01(ctx.u / ctx.d) : 1;
    const ink = clamp01(Number(slot.style.getPropertyValue('--mm-tx-ink')) || 0);
    const kind = SHAPES.includes(ctx.params?.shape) ? ctx.params.shape : 'box';
    let roughness = Math.min(2, Math.max(0, Number(ctx.params?.roughness ?? 1)));
    let boil = BOIL;

    const doc = el.ownerDocument;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mm-sketch');
    svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('class', 'mm-sketch__pen');
    svg.append(path);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.append(svg);

    // where the outline goes. The pen wanders up to `reach` from its line; it sits that far inside
    // the slot when the padding has room. With less room a slot that has words keeps the pen off
    // them: inside with a steadier hand while the padding holds the pen, else round the words just
    // outside the slot; an empty slot steadies the hand until the pen fits inside
    const width = parseFloat(getComputedStyle(path).strokeWidth) || 2, half = width / 2;
    const cs = getComputedStyle(el);
    const pad = el === slot ? Math.min(...['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k) => parseFloat(cs[k]) || 0)) : 0;
    const reachOf = (r, b) => half * (1 + REACH * r + b);
    const words = ownWords(el);
    let inset = reachOf(roughness, boil);
    const steady = (room) => {   // the roughness and boil that fit in `room`
      const k = Math.max(0, room / half - 1) / (REACH * roughness + boil || 1);
      if (k < 1) { roughness *= k; boil *= k; }
      return Math.min(room, reachOf(roughness, boil));
    };
    if (pad < inset) {
      if (!words) inset = steady(Math.min(w, h) / 4);
      else if (pad >= width) inset = steady(pad);
      else inset = pad - inset;   // negative: the outline goes round the words, just outside the slot
    }
    const ow = Math.max(1, w - 2 * inset), oh = Math.max(1, h - 2 * inset);
    const own = { x: inset, y: inset, w: ow, h: oh, r: kind === 'pill' ? Math.min(ow, oh) / 2 : Math.max(0, radiusOf(el, w, h) - inset) };
    // a pill is a box whose radius is half its height: as a box it can morph to any finished corner
    const as = kind === 'pill' ? 'box' : kind;
    const m = smooth(INK.straight[0], INK.straight[1], ink);
    const partner = ink > 0 && el === slot ? partnerOf(slot) : null;
    const edge = partner && boxOn(el, partner);
    // the finished slot's own edge, the line half a pen inside it so the stroke lies on the edge
    const target = edge && { x: edge.x + half, y: edge.y + half, w: Math.max(1, edge.w - width), h: Math.max(1, edge.h - width), r: Math.max(0, edge.r - half) };
    const box = target ? lerpBox(own, target, m) : own;
    const plan = planOf(shapeOf(as, own, own.r), Math.max(4, STEP * half));
    // the seed is the slot's own (ctx.random is seeded from its selector): the same sketch at every seek
    const seed = Math.floor(ctx.random() * 4294967296);
    path.setAttribute('d', stroke(shapeOf(as, box, box.r), { seed, roughness: roughness * (1 - m), boil: boil * (1 - m), frame: ctx.boil(), pen: width, plan }));

    if (q < 1) {
      // both passes share one normalised length: the pen goes round once, then over itself
      path.setAttribute('pathLength', '1');
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = r3(1 - pen(q / DRAW));
    }
    const label = smooth(LABEL, 1, q) * (1 - smooth(INK.handover[0], INK.handover[1], ink));
    if (label < 1) el.style.setProperty('--mm-sketch-text', r3(label));
    const lift = smooth(INK.lift[0], INK.lift[1], ink);
    if (lift > 0) svg.style.opacity = r3(1 - lift);
  },
};

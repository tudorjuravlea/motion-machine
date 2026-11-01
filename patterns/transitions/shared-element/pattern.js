// transitions/shared-element: an element that carries the same key in both scenes travels from its
// box in the outgoing scene to its box in the incoming one. Both boxes are read with the pattern's own
// writes cleared (the state at p = 0); each copy is then moved by a translate and a scale about its centre
// (runtime/kit/projection.js), so the result is a function of p alone. What a scale would distort is
// corrected: with a non-uniform scale the element's children are scaled back so a logo or a line of
// type keeps its shape, and its corner radius and shadow are divided by the scale so they look the same
// size on the page. The scenes cross-fade in windows that never dip (the incoming rises first, the outgoing
// falls after). A pair whose proportions differ by more than 0.2 is cropped or moved without scaling when
// `fit` is `box`. Travel can bow on an arc.
// The key is `data-shared="key"` in markup; a beat reaches it as `params: { shared: "key" }`, which
// the kit writes as `data-p-shared`. Only beat slots count: the kit restores their inline style.
import { journey, mixRadius, cornerFix, shadowFix, cropPlace, fadeWindows } from '../../../runtime/kit/projection.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const px = (x) => `${Math.round(x * 1000) / 1000}px`;
const OWN = ['transform', 'transform-origin', 'border-radius', 'box-shadow', 'clip-path'];

const params = {
  fit: { type: 'enum(width|stretch|box)', default: 'width', meaning: 'width scales both axes by the width ratio so type keeps its shape; stretch fills the target box exactly; box fills it exactly unless the proportions differ by more than 0.2, then `mismatch` decides' },
  mismatch: { type: 'enum(crop|position)', default: 'crop', meaning: 'with fit box and proportions that differ by more than 0.2: crop is a window changing shape over evenly scaled content, position moves the copies without scaling' },
  arc: { type: 'number', default: 0, meaning: 'how far the travel bows, as a share of the distance (0 is straight; 0.5 is a graceful arc), on the same side of the screen whichever way it goes' },
  side: { type: 'enum(auto|cw|ccw)', default: 'auto', meaning: 'which way an arc bows: the same side of the screen (auto), or clockwise or counter-clockwise from the direction of travel' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

const SELECTOR = '[data-slot][data-shared], [data-slot][data-p-shared]';
const keyOf = (el) => el.getAttribute('data-shared') ?? el.getAttribute('data-p-shared');

function collect(section) {
  const found = new Map();
  if (!section) return found;
  for (const el of section.querySelectorAll(SELECTOR)) {
    const key = keyOf(el);
    if (key && !found.has(key)) found.set(key, el);
  }
  return found;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  for (const c of el.querySelectorAll('[data-mm-counter]')) { c.style.removeProperty('transform'); c.removeAttribute('data-mm-counter'); if (!c.getAttribute('style')) c.removeAttribute('style'); }
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

/** The first corner radius in px, or null when it is a percentage (which follows the box on its own). */
function radiusOf(cs) {
  const v = cs.borderTopLeftRadius || '';
  return v.includes('%') ? null : parseFloat(v) || 0;
}

const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

function paint(el, s, { box, win, vr, shadow, counter, children }) {
  el.style.transformOrigin = 'center';
  if (win) {
    const c = cropPlace(box, win);
    el.style.transform = `translate(${px(c.tx)}, ${px(c.ty)}) scale(${r3(c.k)})`;
    const cl = c.clip, rad = vr == null ? 0 : vr / c.k;
    el.style.clipPath = `inset(${px(cl.top)} ${px(cl.right)} ${px(cl.bottom)} ${px(cl.left)} round ${px(rad)})`;
    if (vr != null) el.style.borderRadius = px(rad);
    if (shadow && shadow !== 'none') el.style.boxShadow = shadowFix(shadow, c.k, c.k);
    return;
  }
  el.style.transform = `translate(${px(s.tx)}, ${px(s.ty)}) scale(${r3(s.sx)}, ${r3(s.sy)})`;
  if (vr != null) { const [hx, hy] = cornerFix(vr, s.sx, s.sy); el.style.borderRadius = `${px(hx)} / ${px(hy)}`; }
  if (shadow && shadow !== 'none') el.style.boxShadow = shadowFix(shadow, s.sx, s.sy);
  if (counter) for (const c of children) {
    c.node.setAttribute('data-mm-counter', '');
    c.node.style.transform = `scale(${r3(1 / s.sx)}, ${r3(1 / s.sy)})${c.own}`;
  }
}

export default {
  name: 'shared-element',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    const before = collect(from), after = collect(to);
    for (const el of [...before.values(), ...after.values()]) clear(el);
    to.style.removeProperty('opacity');
    if (from) from.style.removeProperty('opacity');
    if (p >= 1) {
      if (!to.getAttribute('style')) to.removeAttribute('style');
      if (from && !from.getAttribute('style')) from.removeAttribute('style');
      return;
    }
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    const arc = { strength: Math.max(0, Number(prm.arc) || 0), side: prm.side };
    // Read every box first, then write: reading never sees this call's own writes.
    const pairs = [];
    for (const [key, b] of after) {
      const a = before.get(key);
      if (!a) continue;
      const ra = rectOf(a), rb = rectOf(b);
      const j = journey(ra, rb, { fit: prm.fit, mismatch: prm.mismatch });
      if (!j) continue;
      const csA = getComputedStyle(a), csB = getComputedStyle(b);
      const radA = radiusOf(csA), radB = radiusOf(csB);
      const kids = (el) => [...el.children].map((node) => ({ node, own: (t => (t && t !== 'none' ? ` ${t}` : ''))(getComputedStyle(node).transform) }));
      pairs.push({ a, b, ra, rb, j, radA, radB, shA: csA.boxShadow, shB: csB.boxShadow, kidsA: j.counter ? kids(a) : [], kidsB: j.counter ? kids(b) : [] });
    }
    for (const { a, b, ra, rb, j, radA, radB, shA, shB, kidsA, kidsB } of pairs) {
      const m = j.at(q, arc);
      const vr = radA == null || radB == null || (radA === 0 && radB === 0) ? null : mixRadius(radA, radB, q);
      if (j.kind === 'crop') {
        paint(a, null, { box: ra, win: m.win, vr, shadow: shA });
        paint(b, null, { box: rb, win: m.win, vr, shadow: shB });
      } else {
        paint(a, m.a, { vr, shadow: shA, counter: j.counter, children: kidsA });
        paint(b, m.b, { vr, shadow: shB, counter: j.counter, children: kidsB });
      }
    }
    const w = fadeWindows(q);
    to.style.opacity = r3(w.lead);
    if (from) from.style.opacity = r3(w.follow);
  },
};

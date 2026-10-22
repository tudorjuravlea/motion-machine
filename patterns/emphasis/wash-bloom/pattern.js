// emphasis/wash-bloom: a sketched slot is coloured in. Once entrances/sketch has closed its outline,
// a wash in one palette role blooms open behind the ink in a few layers, each starting a little after
// the one inside it, grown from the slot's middle out to the outline and shifted a touch off it the
// way a second print plate lands. Slots bloom in the order their pens drew them, and the default role
// steps through accent, muted, line and surface in that order, so the brand paints the picture.
// After the window entrances/sketch keeps the whole wash: the bloom is drawn into the sketch's own
// fill layer by bloom(), which both patterns call (the sketch with k = 1). The ink line and the
// label are never touched. On a slot without that entrance it draws nothing.
import { shapeOf, wash, lerpBox } from '../../../runtime/kit/rough.js';
import { hash, random } from '../../../runtime/kit/random.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const r3 = (x) => Math.round(x * 1000) / 1000;

export const ROLES = ['accent', 'muted', 'line', 'surface'];
const LAYERS = 3;
const STAGGER = 0.18;   // each layer starts this much of the window after the one inside it
const GROW = 0.64;      // and opens over this much of it
const START = 0.3;      // a layer opens from a box this fraction of the outline's size, about its middle
const ALPHA = 0.14;     // the innermost layer's strength; the outer ones fainter

const params = {
  bloom: { type: 'enum(cycle|accent|muted|line|surface)', default: 'cycle', meaning: 'the palette role of the wash; cycle steps through accent, muted, line and surface in the order the pens drew the slots. Give it among the beat\'s own params so the sketch keeps it after the window' },
  offset: { type: 'number', default: 2, meaning: 'how far the wash lands off the outline, in pen half-widths, 0 (on register) to 6; every slot of a scene shifts the same way' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/** The role a slot blooms in: the fixed one, or the next in ROLES by its place in the scene's pen order. */
export function bloomRole(slot, prm = {}) {
  if (ROLES.includes(prm.bloom)) return prm.bloom;
  const scene = slot.closest('[data-scene]') ?? slot.ownerDocument;
  const all = [...scene.querySelectorAll('[data-slot][data-emphasis="emphasis/wash-bloom"][data-fx="entrances/sketch"]')];
  const key = (el) => [Number(el.getAttribute('data-step')) || 0, Number(el.getAttribute('data-at')) || 0];
  all.sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || all.indexOf(a) - all.indexOf(b); });
  return ROLES[Math.max(0, all.indexOf(slot)) % ROLES.length];
}

/**
 * Draws the bloom at k (0 to 1 through the window) into `group`, whose dataset carries what the
 * sketch measured: kind, box ("x y w h r"), plan, seed, pen, role and offset. Replaces what was there.
 */
export function bloom(group, k) {
  const ds = group.dataset;
  const [x, y, w, h, r] = ds.box.split(' ').map(Number);
  const box = { x, y, w, h, r };
  const plan = ds.plan.split(',').map(Number), seed = Number(ds.seed), pen = Number(ds.pen), offset = Number(ds.offset);
  const angle = Number(ds.angle);
  const small = { x: x + (w * (1 - START)) / 2, y: y + (h * (1 - START)) / 2, w: w * START, h: h * START, r: r * START };
  group.replaceChildren();
  for (let i = 0; i < LAYERS; i++) {
    const e = smooth((k - i * STAGGER) / GROW);
    if (e <= 0) continue;
    const b = lerpBox(small, box, e);
    // each layer from the same seed and plan, so the wash only grows: it never reshuffles
    const layer = wash(shapeOf(ds.kind, b, b.r), { seed, pen, plan, layers: LAYERS, alpha: ALPHA, offset: offset * e, angle })[i];
    if (!layer) continue;
    const p = group.ownerDocument.createElementNS(NS, 'path');
    // the outermost layer keeps a faint rim, where the pigment gathers as it dries
    p.setAttribute('class', i === LAYERS - 1 ? 'mm-bloom__wash mm-bloom__wash--rim' : 'mm-bloom__wash');
    p.setAttribute('d', layer.d);
    p.style.fill = `var(--mm-color-${ds.role})`;
    if (i === LAYERS - 1) { p.style.stroke = `var(--mm-color-${ds.role})`; p.style.strokeOpacity = String(r3(0.3 * e)); }
    p.style.fillOpacity = String(r3(layer.alpha * e));
    group.append(p);
  }
}

/** The bloom group's settings, from the sketch's outline, the slot and the params. */
export function bloomSettings(slot, { kind, box, plan, seed, pen }, prm = {}) {
  const o = { ...DEFAULTS, ...prm };
  const scene = slot.closest('[data-scene]')?.getAttribute('data-scene') ?? '';
  return {
    kind, box: [box.x, box.y, box.w, box.h, box.r].map(r3).join(' '), plan: plan.join(','), seed: String(seed), pen: String(pen),
    role: bloomRole(slot, o), offset: String(Math.min(6, Math.max(0, Number(o.offset) || 0))),
    angle: String(r3(random(hash(`wash-bloom:${scene}`))() * Math.PI * 2)),   // one shift for the whole scene, like one press
  };
}

export default {
  name: 'wash-bloom',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    if (el.getAttribute('data-fx') !== 'entrances/sketch') return;
    const group = el.querySelector(':scope > svg.mm-sketch-fill > g.mm-bloom');
    if (!group) return;   // the sketch draws the group once its pen has closed
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    bloom(group, q);
  },
};

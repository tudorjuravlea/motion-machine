// transitions/flood: a disc of one palette role grows from a slot of the outgoing scene until it
// covers the frame past every corner, holds, then shrinks into a slot of the incoming scene while
// its centre travels from the first slot to the second. The scenes swap at the middle of the cut,
// under full cover, so no frame holds both: before the swap only the outgoing scene is drawn, from
// the swap only the incoming one. The disc is a pseudo-element drawn by pattern.css from
// --mm-tx-flood-* properties on the drawn section's inline style, which the kit restores on every
// seek.
//
// The flood lasts 1.3 s whatever the motion style (divided by `speed`, 0.5 to 2): a 0.5 s grow on an
// ease-in-out, a short full cover (`hold`, 0.12 of the cut, about 0.15 s), a 0.54 s shrink on a
// strong ease-out and, when it lands on a mark, a 0.1 s hand-over. Phases run on the cut's linear
// time (u / d) in those proportions; no phase goes under its floor (0.24 s grow, 0.35 s shrink,
// 0.08 s hand-over), the cover giving way first.
//
// With `land: dot` or `land: circle` the disc lands on a round mark of the incoming scene instead of
// a point: the tittle of the first "i" or "j" in the target's text (else its first full stop or
// round bullet), measured from the letter's own rasterised mask (runtime/kit/glyphs.js dotOf), or a
// round element (a corner radius of at least half its side). The collapse onto it takes 0.54 s on
// the strong ease-out, so the disc visibly settles onto exactly that circle's centre and radius (an
// oval dot's upright ellipse); the disc stays in the flood's role throughout and, over the 0.1 s
// hand-over, fades to nothing over the mark it covers, so the
// real mark is what shows by p = 1, with no blended tone and no edge popping. With no round mark
// found it lands on a point and says so.
import { dotOf, maskOf } from '../../../runtime/kit/glyphs.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['opacity', 'visibility', '--mm-tx-flood-x', '--mm-tx-flood-y', '--mm-tx-flood-r', '--mm-tx-flood-ry', '--mm-tx-flood-color'];
const ROLES = ['accent', 'ink', 'muted', 'surface', 'canvas'];

const params = {
  from: { type: 'string', default: '', meaning: 'a slot of the outgoing scene the flood grows from (the centre of its box); empty grows from the frame centre' },
  to: { type: 'string', default: '', meaning: 'a slot of the incoming scene the flood shrinks into; empty shrinks back to where it grew from' },
  color: { type: 'enum(accent|ink|muted|surface|canvas)', default: 'accent', meaning: 'the palette role of the flood' },
  hold: { type: 'number', default: 0.12, meaning: 'share of the cut the frame stays fully covered, 0 to 0.6 (about 0.15 s at the default; the cover gives way first when a phase would go under its floor)' },
  speed: { type: 'number', default: 1, meaning: 'how fast the whole flood plays, 0.5 to 2: the cut lasts 1.3 s divided by it, every phase in proportion' },
  overscale: { type: 'number', default: 1.05, meaning: 'how far past the farthest frame corner the disc reaches, 1 to 1.5' },
  land: { type: 'enum(point|dot|circle)', default: 'point', meaning: 'what the disc shrinks onto: a point; the dot of the first i or j (else a full stop or round bullet) in the to slot\'s text; or a round element (the to slot itself or one inside it), matched in centre and size' },
};
// The flood's length and its shape, in seconds at speed 1: a 0.5 s grow, the full cover (`hold`, a
// share of the cut), a 0.54 s shrink and, when it lands on a mark, a 0.1 s hand-over; 1.3 s in all
// with the default hold. Each phase has a floor no speed or short cut takes it under.
const LENGTH = 1.3;
const SHAPE = { grow: 0.5, shrink: 0.54, hand: 0.1 };
const FLOOR = { grow: 0.24, shrink: 0.35, hand: 0.08 };
const LANDS = ['point', 'dot', 'circle'];
const inOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
// the shrink's travel: a strong ease-out, so the disc visibly settles where it lands
const settle = (x) => 1 - (1 - clamp01(x)) ** 4;
const speedOf = (v) => Math.min(2, Math.max(0.5, Number(v) || 1));

/** The cut's length for these params: 1.3 s divided by `speed` (0.5 to 2), never under the phases' floors. */
export function durOf(params = {}) {
  return Math.max(LENGTH / speedOf(params.speed), FLOOR.grow + FLOOR.shrink + FLOOR.hand);
}

/**
 * The phases of a cut of d seconds as shares of it: `a` the grow, `h` the full cover, `s` the shrink
 * and, when it lands on a mark, `b` the hand-over on it; `swap` is when the incoming scene takes
 * over, always under full cover (the middle of the cut when the cover spans it). The grow, the
 * shrink and the hand-over keep the proportions of 0.5 : 0.54 : 0.1 around the cover; a phase that
 * would fall under its floor is raised to it, the cover giving way first. A point shrinks over the
 * shrink and the hand-over together.
 */
export function phasesOf(d, hold, land = false) {
  const D = d > 0 ? d : LENGTH;
  let h = Math.min(0.6, Math.max(0, Number(hold) || 0)) * D;
  const k = (D - h) / (SHAPE.grow + SHAPE.shrink + SHAPE.hand);
  const t = { grow: SHAPE.grow * k, shrink: SHAPE.shrink * k, hand: SHAPE.hand * k };
  let short = 0;
  for (const n of Object.keys(t)) if (t[n] < FLOOR[n]) { short += FLOOR[n] - t[n]; t[n] = FLOOR[n]; }
  const fromHold = Math.min(h, short);
  h -= fromHold; short -= fromHold;
  if (short > 0) {   // the cover is gone: the phases above their floors give the rest, in proportion
    const spare = Object.keys(t).reduce((a, n) => a + t[n] - FLOOR[n], 0);
    for (const n of Object.keys(t)) t[n] -= spare > 0 ? (short * (t[n] - FLOOR[n])) / spare : short / 3;
  }
  const a = t.grow / D, hh = h / D, swap = Math.min(a + hh, Math.max(a, 0.5));
  return land ? { a, h: hh, s: t.shrink / D, b: 1 - a - hh - t.shrink / D, swap } : { a, h: hh, s: 1 - a - hh, b: 0, swap };
}

/**
 * The disc at linear time l: `{ x, y, r, ry?, color }`. It grows on an ease-in-out about c0 to `over`
 * past the farthest corner of the W x H frame, holds, then shrinks on a strong ease-out while its
 * centre travels to c1: to a point, or with a `target` ({ x, y, r, ry }) settling onto exactly that mark (a circle, or the
 * upright ellipse of an oval dot: `r` across, `ry` down), where it stays to the end of the cut. The
 * colour is always the flood's role; on the mark, over the hand-over, it fades to transparent, so
 * the real mark shows through and no blended tone is ever drawn.
 */
export function discAt(l, { d, hold, land = false, c0, c1, target = null, W, H, over, flood }) {
  const ph = phasesOf(d, hold, land && !!target);
  const cover = ([x, y]) => over * Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
  if (l < ph.a) return { x: c0[0], y: c0[1], r: inOut(l / ph.a) * cover(c0), color: flood };
  if (l <= ph.a + ph.h) return { x: c0[0], y: c0[1], r: cover(c0), color: flood };
  if (!target) {
    const k = settle((l - ph.a - ph.h) / ph.s);
    const c = [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k];
    return { x: c[0], y: c[1], r: (1 - k) * cover(c), color: flood };
  }
  const ty = target.ry ?? target.r;
  if (l >= ph.a + ph.h + ph.s) {
    // on the mark: the flood's role fading to nothing over the mark it covers
    const keep = 1 - smooth(clamp01((l - (1 - ph.b)) / ph.b));
    const color = keep >= 1 ? flood : `color-mix(in srgb, ${flood} ${(keep * 100).toFixed(2)}%, transparent)`;
    return { x: target.x, y: target.y, r: target.r, ry: ty, color };
  }
  const k = settle((l - ph.a - ph.h) / ph.s);
  const c = [c0[0] + (target.x - c0[0]) * k, c0[1] + (target.y - c0[1]) * k];
  return { x: c[0], y: c[1], r: target.r + (1 - k) * (cover(c) - target.r), ry: ty + (1 - k) * (cover(c) - ty), color: flood };
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

// The centre of a slot of a section in its layout pixels (the stage may be drawn scaled); null when
// the slot is missing or has no box.
function centreOf(section, name) {
  if (!name || !section?.querySelector) return null;
  const r = section.querySelector(`[data-slot="${name}"]`)?.getBoundingClientRect?.();
  const s = section.getBoundingClientRect?.();
  if (!r || !s || !r.width || !r.height || !s.width || !s.height) return null;
  return [(r.left - s.left + r.width / 2) * (section.offsetWidth / s.width), (r.top - s.top + r.height / 2) * (section.offsetHeight / s.height)];
}

// A note for the story author in mm.warnings, once.
function note(section, msg) {
  const w = section?.ownerDocument?.defaultView?.mm?.warnings;
  if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
}

// A slot name that matches no slot of the scene is a note for the story author in mm.warnings, once.
function checkSlot(section, name, key, fallback) {
  if (!name || !section?.querySelector || section.querySelector(`[data-slot="${name}"]`)) return;
  note(section, `transitions/flood: ${key} "${name}" is not a slot of scene ${section.getAttribute?.('data-scene') ?? '?'}; ${fallback}`);
}

// ---- the round mark a landing disc matches, in the section's layout pixels ----

// The section's scale (the stage may be drawn scaled) and a box in its layout pixels.
function frameOf(section) {
  const s = section.getBoundingClientRect();
  const k = s.width / (section.offsetWidth || 1) || 1;
  return { s, k, box: (r) => ({ x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }) };
}

// One character rasterised off screen in a computed font at `px` per em, as the cell dotOf reads
// (with its coverage); cached by font, size and character. The canvas never joins the page.
const CELLS = new Map();
function cellOf(doc, font, px, ch) {
  const key = `${font}|${px}|${ch}`;
  if (CELLS.has(key)) return CELLS.get(key);
  const spec = font.replace('@px', `${px}px`);
  const c = doc.createElement('canvas');
  let g = c.getContext('2d', { willReadFrequently: true });
  g.font = spec;
  const m = g.measureText(ch);
  const asc = Math.ceil(Math.max(m.fontBoundingBoxAscent || px, m.actualBoundingBoxAscent || 0));
  const desc = Math.ceil(Math.max(m.fontBoundingBoxDescent || px * 0.3, m.actualBoundingBoxDescent || 0));
  const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0)), pad = Math.ceil(px * 0.1);
  c.width = left + Math.ceil(Math.max(m.width, m.actualBoundingBoxRight || 0)) + 2 * pad;
  c.height = asc + desc + 2 * pad;
  g = c.getContext('2d', { willReadFrequently: true });
  g.font = spec;
  const ox = pad + left, oy = pad + asc;
  g.fillText(ch, ox, oy);
  const rgba = g.getImageData(0, 0, c.width, c.height).data;
  const alpha = new Uint8Array(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const cell = { mask: maskOf(rgba, c.width, c.height), alpha, w: c.width, h: c.height, ox, oy, ascent: (m.fontBoundingBoxAscent || px) / px };
  CELLS.set(key, cell);
  return cell;
}

// The dot of the first "i" or "j" in the scope's text (else its first full stop or round bullet):
// { x, y, r, ry } in layout pixels (r across, ry down), or null when there is none or it is
// neither a disc nor an upright ellipse.
function dotIn(section, scope) {
  const doc = section.ownerDocument, f = frameOf(section);
  const walk = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let found = null, stop = null;
  for (let n = walk.nextNode(); n && !found; n = walk.nextNode()) {
    if (n.parentElement.closest('svg, [aria-hidden="true"]')) continue;
    if (getComputedStyle(n.parentElement).textTransform === 'uppercase') continue;
    const s = n.textContent;
    const i = s.search(/[ij]/);
    if (i >= 0) found = { n, i };
    else if (!stop) { const k = s.search(/[.•·∙●]/); if (k >= 0) stop = { n, i: k }; }
  }
  const at = found ?? stop;
  if (!at) return null;
  const range = doc.createRange();
  range.setStart(at.n, at.i); range.setEnd(at.n, at.i + 1);
  const rect = range.getClientRects()[0];
  if (!rect || !rect.width) return null;
  const el = at.n.parentElement, cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 16;
  // the letter at its own size scaled up to at least 240 px per em, so the measure holds to a fraction of a pixel
  const scale = Math.max(1, Math.ceil(240 / size)), px = size * scale;
  const ch = at.n.textContent[at.i];
  const cell = cellOf(doc, `${cs.fontStyle} ${cs.fontWeight} @px ${cs.fontFamily}`, px, ch);
  const d = dotOf(cell, { char: ch, em: px });
  if (!d || !d.round) return null;
  const b = f.box(rect);
  // the letter's size in the section's layout px: its own size times any scale its element is drawn at
  const own = el.getBoundingClientRect();
  const size1 = size * (el.offsetWidth && own.width ? own.width / el.offsetWidth / f.k : 1);
  const baseline = b.y + cell.ascent * size1;
  return { x: b.x + d.x * size1, y: baseline + d.y * size1, r: d.rx * size1, ry: d.ry * size1 };
}

// The first round element in the scope (itself, then what it holds): a box no more than a pixel off
// square whose every corner radius reaches half its side, with a visible fill.
function circleIn(section, scope) {
  const f = frameOf(section);
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const b = f.box(r), side = Math.min(b.w, b.h), cs = getComputedStyle(el);
    if (Math.abs(b.w - b.h) > 1) continue;
    const rad = (v) => { const x = parseFloat(v) || 0; return v.trim().endsWith('%') ? (x / 100) * side : x; };
    const round = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].every((k) => rad(cs[k].split(' ')[0]) >= side / 2 - 0.5);
    const fill = cs.backgroundColor;
    if (!round || !fill || /^rgba\(.*,\s*0\)$/.test(fill) || fill === 'transparent') continue;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, r: side / 2, ry: side / 2 };
  }
  return null;
}

// The mark a landing disc matches in the incoming section: in the `to` slot, else the whole scene.
function landOf(section, name, kind) {
  if (!section?.querySelector || typeof getComputedStyle !== 'function') return null;
  const scope = (name && section.querySelector(`[data-slot="${name}"]`)) || section.querySelector('.mm-camera') || section;
  return kind === 'dot' ? dotIn(section, scope) : circleIn(section, scope);
}

function hide(el) { if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } }

export default {
  name: 'flood',
  group: 'transitions',
  dur: LENGTH,   // seconds, whatever the style's roles: the flood reads at its own pace (a cut of durOf(params) where the kit sizes cuts by their params)
  durOf,         // the kit sizes the cut by the scene's cutParams: 1.3 s divided by speed
  canvasText: true,   // a landing on a dot rasterises the letter off screen to find its tittle; the canvas never joins the page
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const hold = Math.min(0.6, Math.max(0, Number(prm.hold) || 0));
    const over = Math.min(1.5, Math.max(1, Number(prm.overscale) || 1));
    const l = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);

    const W = to.offsetWidth || 1, H = to.offsetHeight || 1;
    checkSlot(from, prm.from, 'from', 'the flood grows from the frame centre');
    checkSlot(to, prm.to, 'to', 'the flood shrinks back to where it grew from');
    const c0 = centreOf(from, prm.from) ?? [W / 2, H / 2];
    const c1 = centreOf(to, prm.to) ?? c0;
    const role = ROLES.includes(prm.color) ? prm.color : params.color.default;
    const kind = LANDS.includes(prm.land) ? prm.land : 'point';
    const target = kind === 'point' ? null : landOf(to, prm.to, kind);
    if (kind !== 'point' && !target) note(to, `transitions/flood: land "${kind}" found no ${kind === 'dot' ? 'round dot of an i, a j, a full stop or a bullet' : 'round element'} in ${prm.to ? `slot "${prm.to}" of ` : ''}scene ${to.getAttribute?.('data-scene') ?? '?'}; it lands on a point`);
    const disc = discAt(l, { d: ctx.d, hold, land: !!target, c0, c1, target, W, H, over, flood: `var(--mm-color-${role})` });
    const swap = phasesOf(ctx.d, hold, !!target).swap;
    const want = durOf(prm);
    if (ctx.params?.speed != null && ctx.d > 0 && Math.abs(ctx.d - want) > 0.01) note(to, `transitions/flood: speed ${speedOf(prm.speed)} asks for a ${r3(want)} s cut, but the cut into scene ${to.getAttribute?.('data-scene') ?? '?'} lasts ${r3(ctx.d)} s; the flood keeps its proportions over ${r3(ctx.d)} s`);

    const drawn = l < swap ? from : to;
    hide(l < swap ? to : from);
    if (!drawn) return;
    drawn.style.setProperty('--mm-tx-flood-color', disc.color);
    drawn.style.setProperty('--mm-tx-flood-x', `${r3(disc.x)}px`);
    drawn.style.setProperty('--mm-tx-flood-y', `${r3(disc.y)}px`);
    drawn.style.setProperty('--mm-tx-flood-r', `${r3(disc.r)}px`);
    if (disc.ry != null) drawn.style.setProperty('--mm-tx-flood-ry', `${r3(disc.ry)}px`);
  },
};

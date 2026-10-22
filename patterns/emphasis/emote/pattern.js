// emphasis/emote: a small hand-drawn reaction pops up beside the words and goes: an exclamation, a
// question, a heart, a sparkle, an ellipsis, a sleepy zzz, a music note or two drops of sweat. Each
// mark is pen strokes (runtime/kit/rough.js, the coherent voice), never text, with a fill where the
// mark has one: a dot in the strokes' role, a wash of the accent for a heart, a sparkle or a drop.
// By default it is drawn in the full accent, each stroke and dot at full opacity over a soft halo
// of the same role (a wider stroke at an alpha), so it reads bright and lit from inside. It pops with a
// small overshoot from the corner nearest the words, holds while it shivers on the kit's boil clock
// (ctx.boil, still in a deck), and fades. It sits outside the words' box and inside the safe area,
// clear of every other line in its scene, sliding along its side or changing side when its place is
// taken, and is left out, with a warning, when no place is free. At p = 0 and p = 1 it writes nothing.
import { polyOf, planOf, sample, pathOf, passes, wash, STEP } from '../../../runtime/kit/rough.js';
import { boxOf, safeArea } from '../../../runtime/kit/room.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const POP = 0.22, FADE = 0.75;   // the pop over the first 22 % of the window, the fade over the last 25 %
const BACK = 1.70158;            // the pop's overshoot: about 10 %
const GAP = 0.25;                // the room between the words and the mark, in mark heights
const BOIL = 0.4;                // the shiver while it holds, in pen half-widths
const OVER = 0.12;               // room for the pop's overshoot, in mark sizes
const HALO = 3;                  // the halo's width, in pens
const HALO_ALPHA = 0.28;         // the halo's opacity: a soft glow of the strokes' role
const WASH = 0.8;                // a wash layer's opacity: two layers read as the accent itself
const INK_PAD = 2.5 + (HALO - 1) / 2;   // room for the ink past the mark's box (the halo, the wander and a wash's bleed), in pens

export const MARKS = ['exclaim', 'question', 'heart', 'sparkle', 'dots', 'zzz', 'note', 'drops'];
const SIDES = ['right', 'left', 'top'];
const ORDER = { right: ['right', 'left', 'top', 'bottom'], left: ['left', 'right', 'top', 'bottom'], top: ['top', 'right', 'left', 'bottom'] };

const params = {
  mark: { type: `enum(${MARKS.join('|')})`, default: 'exclaim', meaning: 'the reaction: a surprise, a question, a like, a launch, a pause, boredom, a tune, a nervous moment' },
  side: { type: `enum(${SIDES.join('|')})`, default: 'right', meaning: 'where it sits against the words: above their right or left end, or centred above them; another side is taken when this one has no room' },
  size: { type: 'number', default: 0.75, meaning: 'the mark\'s height in units of the format (ctx.unit), 0.25 to 1' },
  color: { type: 'enum(ink|accent)', default: 'accent', meaning: 'the role of the strokes and dots, each over a soft halo of that role; a heart, a sparkle or a drop is washed in the accent' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

// ---- the marks, each in a box of height 1 and width w, origin top left ----
// an oval around its centre [x, y] with half-axes [a, b], as a closed outline of `sides` corners
const oval = ([x, y], [a, b], sides) => Array.from({ length: sides }, (_, i) => { const t = (2 * Math.PI * i) / sides; return [x + a * Math.cos(t), y + b * Math.sin(t)]; });
const curve = (n, f, closed = false) => Array.from({ length: closed ? n : n + 1 }, (_, i) => f(i / n));
const dot = (cx, cy, r) => ({ points: oval([cx, cy], [r, r], 16), closed: true, paint: 'ink' });
const zig = (x, y, s) => ({ points: [[x, y], [x + s, y], [x, y + s], [x + s, y + s]], closed: false, paint: 'stroke' });
function star(cx, cy, r) {   // four long points and four short ones
  return Array.from({ length: 8 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 4, k = i % 2 ? 0.26 : 1; return [cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)]; });
}
function drop(cx, cy, R) {   // a teardrop, its point up
  return curve(32, (u) => { const t = u * Math.PI * 2; return [cx + 0.75 * R * Math.sin(t) * Math.sin(t / 2), cy - R * Math.cos(t)]; }, true);
}
// the classic heart curve, scaled into its box (x from -16 to 16, y from -12 to 17 before scaling)
function heart() {
  const pts = curve(48, (u) => { const t = u * Math.PI * 2; return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; }, true);
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  const y0 = Math.min(...ys), k = 1 / (Math.max(...ys) - y0), x0 = Math.min(...xs);
  return pts.map(([x, y]) => [(x - x0) * k, (y - y0) * k]);
}
const SHAPES = {
  exclaim: () => ({ w: 0.3, parts: [{ points: [[0.15, 0.02], [0.15, 0.68]], closed: false, paint: 'stroke' }, dot(0.15, 0.9, 0.08)] }),
  question: () => ({ w: 0.6, parts: [{ points: [...curve(16, (u) => { const a = Math.PI + u * (Math.PI + 0.7); return [0.3 + 0.24 * Math.cos(a), 0.28 + 0.24 * Math.sin(a)]; }), [0.3, 0.55], [0.3, 0.68]], closed: false, paint: 'stroke' }, dot(0.3, 0.9, 0.08)] }),
  heart: () => { const pts = heart(); const w = Math.max(...pts.map((p) => p[0])); return { w, parts: [{ points: pts, closed: true, paint: 'wash' }, { points: pts, closed: true, paint: 'stroke' }] }; },
  sparkle: () => ({ w: 1, parts: [{ points: star(0.42, 0.56, 0.42), closed: true, paint: 'wash' }, { points: star(0.42, 0.56, 0.42), closed: true, paint: 'stroke' }, { points: star(0.86, 0.14, 0.13), closed: true, paint: 'stroke' }] }),
  dots: () => ({ w: 1, parts: [dot(0.14, 0.78, 0.1), dot(0.5, 0.78, 0.1), dot(0.86, 0.78, 0.1)] }),
  zzz: () => ({ w: 1, parts: [zig(0.04, 0.62, 0.3), zig(0.32, 0.28, 0.32), zig(0.6, 0, 0.36)] }),
  note: () => ({ w: 0.7, parts: [{ points: oval([0.22, 0.83], [0.18, 0.13], 24), closed: true, paint: 'ink' }, { points: [[0.38, 0.8], [0.38, 0.04]], closed: false, paint: 'stroke' }, { points: [[0.38, 0.04], [0.52, 0.13], [0.64, 0.27], [0.6, 0.44]], closed: false, paint: 'stroke' }] }),
  drops: () => { const a = drop(0.22, 0.32, 0.26), b = drop(0.56, 0.68, 0.3); return { w: 0.8, parts: [{ points: a, closed: true, paint: 'wash' }, { points: a, closed: true, paint: 'stroke' }, { points: b, closed: true, paint: 'wash' }, { points: b, closed: true, paint: 'stroke' }] }; },
};
const CACHE = new Map(MARKS.map((m) => [m, SHAPES[m]()]));
/** A mark's drawing: `{ w, parts: [{ points, closed, paint: stroke | ink | wash }] }` in a box of height 1. */
export function markOf(name) { return CACHE.get(name) ?? CACHE.get('exclaim'); }

/**
 * Where a w x h mark sits against the words' box `text` ({x, y, w, h}) inside `safe` ({x0, y0, x1,
 * y1}), all in one frame, clear of every box in `obstacles` (the other lines of its scene): beside the
 * words on the asked side (above their end, rising past their top), else further along that side
 * (level with the words, then below their end; or over their start or end for top and bottom), else
 * the next side. With the words' own `lines` given, a right or left mark may also sit beside the end
 * (or start) of any one line, clear of every line. Returns `{ x, y, side }` (top left) or null when
 * every place is taken.
 */
export function placeMark(text, safe, { side = 'right', w, h, obstacles = [], lines = [] }) {
  const gap = GAP * h;
  const clampY = (y) => Math.min(Math.max(y, safe.y0), safe.y1 - h);
  const clampX = (x) => Math.min(Math.max(x, safe.x0), safe.x1 - w);
  const clear = (x, y) => [...obstacles, ...lines].every((o) => !(x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h));
  const beside = (L, x) => [{ x, y: clampY(L.y - 0.4 * h) }, { x, y: clampY(L.y + L.h / 2 - h / 2) }];
  const fits = safe.y1 - safe.y0 >= h && safe.x1 - safe.x0 >= w;
  const ys = [text.y - 0.4 * h, text.y + text.h / 2 - h / 2, text.y + text.h - 0.6 * h].map(clampY);
  const xs = [text.x + text.w / 2 - w / 2, text.x + text.w - w, text.x].map(clampX);
  const at = {
    right: () => { const x = text.x + text.w + gap; return [...(x + w <= safe.x1 ? ys.map((y) => ({ x, y })) : []), ...lines.flatMap((L) => beside(L, L.x + L.w + gap)).filter((p) => p.x + w <= safe.x1)]; },
    left: () => { const x = text.x - gap - w; return [...(x >= safe.x0 ? ys.map((y) => ({ x, y })) : []), ...lines.flatMap((L) => beside(L, L.x - gap - w)).filter((p) => p.x >= safe.x0)]; },
    top: () => { const y = text.y - gap - h; return y >= safe.y0 ? xs.map((x) => ({ x, y })) : []; },
    bottom: () => { const y = text.y + text.h + gap; return y + h <= safe.y1 ? xs.map((x) => ({ x, y })) : []; },
  };
  if (!fits) return null;
  for (const s of ORDER[side] ?? ORDER.right) for (const p of at[s]()) if (clear(p.x, p.y)) return { ...p, side: s };
  return null;
}

/** The pop's scale at q through the window: a back-out from 0 that overshoots about 10 %, then exactly 1. */
export function popScale(q) {
  if (q <= 0) return 0;
  if (q >= POP) return 1;
  const x = q / POP - 1;
  return 1 + (BACK + 1) * x ** 3 + BACK * x ** 2;
}
/** The mark's opacity at q: whole until 75 % of the window, then down to 0 at its end. */
export function fadeOf(q) {
  if (q <= FADE) return 1;
  const t = clamp01((q - FADE) / (1 - FADE));
  return 1 - t * t * (3 - 2 * t);
}

// the pen's width: a stroke's computed width, read from a probe inside a scratch svg in the element
function penOf(el, probe) {
  const svg = el.ownerDocument.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mm-emote');
  svg.append(probe);
  el.append(svg);
  const w = parseFloat(getComputedStyle(probe).strokeWidth) || 3;
  svg.remove();
  return w;
}

// every laid-out line of text in the scene, in frame px from layout offsets (a camera move or an
// entrance does not shift them), each marked `own` when it is the element's: the places the mark must
// keep clear of. Each line is measured
// against its slot, so the slot's own transform falls away.
function linesOf(el) {
  const scene = el.closest('[data-scene]') ?? el.ownerDocument.body;
  const out = [], hosts = new Map();
  const walk = el.ownerDocument.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent.trim() || n.parentElement.closest('svg, [aria-hidden="true"]')) continue;
    const host = n.parentElement.closest('[data-slot]') ?? n.parentElement;
    if (!hosts.has(host)) { const r = host.getBoundingClientRect(); hosts.set(host, { r, box: boxOf(host), k: r.width / (host.offsetWidth || 1) || 1 }); }
    const { r, box, k } = hosts.get(host);
    if (!box) continue;
    const range = el.ownerDocument.createRange(); range.selectNodeContents(n);
    for (const q of range.getClientRects()) if (q.width > 0 && q.height > 0) out.push({ x: box.x0 + (q.left - r.left) / k, y: box.y0 + (q.top - r.top) / k, w: q.width / k, h: q.height / k, own: el.contains(n) });
  }
  return out;
}

// A note for the story author in mm.warnings, once per slot.
function warn(el, msg) { const w = el.ownerDocument.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }

// the words' box in the element's own px: the union of the laid-out lines, or the element when it has none
function wordsOf(el, w, h) {
  const box = el.getBoundingClientRect(), k = box.width / (el.offsetWidth || 1) || 1;
  const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
  const rs = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  if (!rs.length) return { x: 0, y: 0, w, h };
  const L = Math.min(...rs.map((r) => r.left)), R = Math.max(...rs.map((r) => r.right)), T = Math.min(...rs.map((r) => r.top)), B = Math.max(...rs.map((r) => r.bottom));
  return { x: (L - box.left) / k, y: (T - box.top) / k, w: (R - L) / k, h: (B - T) / k };
}

export default {
  name: 'emote',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q <= 0 || q >= 1) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const prm = { ...DEFAULTS, ...ctx.params };
    const m = markOf(prm.mark);
    const H = Math.min(1, Math.max(0.25, Number(prm.size) || DEFAULTS.size)) * (ctx.unit || 160), W = m.w * H;
    // place in frame px (layout offsets, so a camera move does not feed back), then back to the element's
    const frame = boxOf(el), safe = safeArea(el);
    const text = wordsOf(el, w, h);
    const all = frame ? linesOf(el) : [];
    const ox = frame ? frame.x0 : 0, oy = frame ? frame.y0 : 0;
    // the box it is placed by holds its ink (the pen, its wander, a wash's bleed) and the pop's overshoot
    const probe = el.ownerDocument.createElementNS(NS, 'path');
    probe.setAttribute('class', 'mm-emote__stroke');
    const pen = penOf(el, probe);
    const pad = INK_PAD * pen;
    const at = placeMark({ x: text.x + ox, y: text.y + oy, w: text.w, h: text.h }, safe ?? { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity },
      { side: SIDES.includes(prm.side) ? prm.side : 'right', w: W * (1 + OVER) + 2 * pad, h: H * (1 + OVER) + 2 * pad, obstacles: all.filter((L) => !L.own), lines: all.filter((L) => L.own) });
    if (!at) {
      const scene = el.closest('[data-scene]')?.dataset.scene, slot = el.closest('[data-slot]')?.dataset.slot;
      warn(el, `[data-scene="${scene}"] [data-slot="${slot}"]: emphasis/emote has no free place beside the words inside the safe area; it draws nothing (a smaller size, another side or shorter words make room)`);
      return;
    }
    // the mark inside that box: the overshoot's room lies on the side away from the words
    const x = at.x - ox + pad + (at.side === 'left' ? OVER * W : at.side === 'right' ? 0 : (OVER * W) / 2);
    const y = at.y - oy + pad + (at.side === 'bottom' ? 0 : OVER * H);

    const doc = el.ownerDocument;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', `mm-emote mm-emote--${prm.color === 'ink' ? 'ink' : 'accent'}`);
    svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
    const g = doc.createElementNS(NS, 'g');
    svg.append(g);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.append(svg);

    const seed = Math.floor(ctx.random() * 4294967296);
    const frameNo = ctx.boil();
    const put = (pts) => pts.map(([px, py]) => [x + px * H, y + py * H]);
    m.parts.forEach((part, i) => {
      const shape = polyOf(put(part.points), part.closed);
      const node = doc.createElementNS(NS, 'path');
      // a stroke or a dot sits on its halo: the same path, wider and soft, drawn first
      const halo = (d) => { const h = doc.createElementNS(NS, 'path'); h.setAttribute('class', 'mm-emote__halo'); h.setAttribute('d', d); h.style.strokeWidth = `${r3(HALO * pen)}px`; h.style.strokeOpacity = String(HALO_ALPHA); g.append(h); };
      if (part.paint === 'stroke') {
        const d = passes(shape, { seed: (seed + i * 7919) >>> 0, pen, roughness: 0.6, coherent: true, wavelength: 8, ghost: 0.9, boil: BOIL, frame: frameNo }).join('');
        halo(d);
        node.setAttribute('class', 'mm-emote__stroke');
        node.setAttribute('d', d);
        g.append(node);
      } else if (part.paint === 'ink') {
        const d = pathOf(sample(shape, planOf(shape, Math.max(2, STEP * pen / 4))), true);
        halo(d);
        node.setAttribute('class', 'mm-emote__dot');
        node.setAttribute('d', d);
        g.append(node);
      } else {
        for (const layer of wash(shape, { seed: (seed + i * 7919) >>> 0, pen, layers: 2, bleed: 1.5, alpha: WASH })) {
          const l = doc.createElementNS(NS, 'path');
          l.setAttribute('class', 'mm-emote__wash');
          l.setAttribute('d', layer.d);
          l.style.fillOpacity = String(layer.alpha);
          g.append(l);
        }
      }
    });
    // the pop grows from the mark's corner nearest the words, so its overshoot moves away from them
    const ax = at.side === 'left' ? x + W : at.side === 'right' ? x : x + W / 2;
    const ay = at.side === 'top' ? y + H : at.side === 'bottom' ? y : y + H;
    const s = popScale(q);
    if (s !== 1) g.setAttribute('transform', `translate(${r3(ax)} ${r3(ay)}) scale(${r3(s)}) translate(${r3(-ax)} ${r3(-ay)})`);
    const a = fadeOf(q);
    if (a < 1) svg.style.opacity = r3(a);
  },
};

// emphasis/dimension: a measure is drawn across what it measures. The drawing (two line halves with
// extension lines and 45° ticks, the value level and centred on the line) is the slot's own CSS,
// keyed on data-emphasis, so it holds at every rest.
//
// What it spans is measured once, when the piece has mounted: by default the slot's own text from
// its first glyph's ink to its last (each glyph's ink edge read from the font, not its box), or with
// `for: <slot>` that slot's text in the same scene (its box when it holds no text: its picture). The
// measure is taken with each scene drawn at its rest (so no entrance's transform reads into it), in
// layout pixels, and written as one rule per slot into a stylesheet of this pattern's own
// (`style[data-mm-dimension]`, outside every element the kit restores), so every seek draws the same
// line: the line's ends, and either a gap centred on the line that holds the value, or, when the
// value is too wide for a gap and two halves (the line measures the value itself), a line passing
// under it. The page is put back at the instant it was showing. This module plays the draw over the emphasis window, on
// the beat's own clock (ctx.u / ctx.d), through four inline custom properties the CSS reads:
// - --mm-dim-ext: the extension lines fade in over the first 20 % of the window;
// - --mm-dim-grow: the line grows from the middle out to both ends between 10 % and 70 %, on the
//   style's move easing;
// - --mm-dim-tick: the ticks land at the ends only once the line has arrived (a tap, not a fade);
// - --mm-dim-label: the value comes in between 60 % and 85 %, as an alpha of ink.
// At the end of the window it writes nothing, and the CSS defaults are the finished drawing.
// The draw is meant to be the arrival (the beat has params.instant: true). When the beat has an
// entrance of its own, the drawing has already arrived with it, so the window writes nothing (no
// redraw from empty) and a note for the author goes to mm.warnings.
import { selectorOf } from '../../../runtime/kit/schedule.js';
import { boxOf } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num4 = (x) => String(Number(x.toFixed(4)));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

const params = {
  axis: { type: 'enum(x|y)', default: 'x', meaning: 'x: the measure runs across the slot; y: it stands, with the halves above and below the value (the slot is at least five body lines tall); give it among the beat\'s own params' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the lines; the value is always ink; among the beat\'s own params' },
  for: { type: 'string', default: '', meaning: 'a slot of the same scene whose text the line spans, ink edge to ink edge (its box when it holds no text); empty spans the slot\'s own text' },
};

/**
 * Where the drawing goes on a line spanning x0 to x1 (the slot's own pixels) with a label labelW
 * wide: `{ mode, x0, x1, g0, g1, pad }`. With room for the label, a `gap` on each side of it and two
 * halves of at least `minHalf`, the label sits in a gap centred on the line (`pad` is its left edge,
 * g0 and g1 the gap's ends); otherwise the line passes `under` it, unbroken (g0 = g1, the middle),
 * and the label stays where its layout puts it (`pad` null).
 */
export function layoutOf({ x0, x1, labelW, gap, minHalf }) {
  const mid = (x0 + x1) / 2;
  if (labelW + 2 * gap + 2 * minHalf <= x1 - x0 + 1e-9) {
    const pad = mid - labelW / 2;
    return { mode: 'gap', x0, x1, g0: pad - gap, g1: pad + labelW + gap, pad };
  }
  return { mode: 'under', x0, x1, g0: mid, g1: mid, pad: null };
}

// ---- the measure, taken once at mount ----

const r2 = (x) => String(Math.round(x * 100) / 100);
let ctx2d = null;
const INK = new Map();
// A glyph's ink either side of its origin, in px, read from the font (its outline's bounds).
function glyphInk(doc, font, ch) {
  const key = `${font}|${ch}`;
  if (!INK.has(key)) {
    ctx2d ??= doc.createElement('canvas').getContext('2d');
    ctx2d.font = font;
    const m = ctx2d.measureText(ch);
    INK.set(key, { l: m.actualBoundingBoxLeft || 0, r: m.actualBoundingBoxRight || m.width });
  }
  return INK.get(key);
}

// The element's text from its first glyph's ink to its last, in frame px ({ x0, x1 }), from layout
// offsets (a transform on the element or its ancestors falls away); its box, or its picture's, when
// it holds no text.
function inkSpan(el) {
  const doc = el.ownerDocument, box = boxOf(el);
  if (!box) return null;
  const r = el.getBoundingClientRect(), k = r.width / (el.offsetWidth || 1) || 1;
  const walk = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT), range = doc.createRange();
  let lo = Infinity, hi = -Infinity;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement.closest('svg, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(n.parentElement), font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const t = n.textContent;
    for (let i = 0; i < t.length;) {
      const cp = t.codePointAt(i), len = cp > 0xffff ? 2 : 1, ch = String.fromCodePoint(cp);
      if (!/\s/.test(ch)) {
        range.setStart(n, i); range.setEnd(n, i + len);
        const q = range.getClientRects()[0];
        if (q && q.width > 0) {
          const g = glyphInk(doc, font, ch), x = box.x0 + (q.left - r.left) / k;
          lo = Math.min(lo, x - g.l); hi = Math.max(hi, x + g.r);
        }
      }
      i += len;
    }
  }
  if (lo <= hi) return { x0: lo, x1: hi };
  const media = el.querySelector('[data-media]'), mb = media && boxOf(media);
  return mb ? { x0: mb.x0, x1: mb.x1 } : { x0: box.x0, x1: box.x1 };
}

// A note for the story author in mm.warnings, once.
function note(doc, msg) { const w = doc.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }

// One rule per dimension slot, measured with its scene at rest: the line's ends, the gap or the
// passage under the value, a containing block for the halves.
function rulesOf(doc, mm) {
  const items = (mm.schedule?.items ?? []).filter((it) => !it.parent && it.beat?.emphasis === 'emphasis/dimension');
  const rules = [];
  const scenes = [...new Set(items.map((it) => it.scene))];
  for (const scene of scenes) {
    const sc = mm.schedule.scenes.find((x) => x.id === scene);
    const hold = mm.schedule.holds?.find((h) => h.scene === scene);
    mm.seek(mm.kind === 'deck' ? sc.end : hold ? hold.from : Math.max(sc.start, sc.end - 1e-3));
    for (const it of items.filter((x) => x.scene === scene)) {
      const el = doc.querySelector(it.selector);
      const bag = it.beat.params?.emphasis ?? it.beat.params ?? {};
      if (!el || bag.axis === 'y' || el.getAttribute('data-p-axis') === 'y') continue;
      const name = typeof bag.for === 'string' ? bag.for : '';
      let target = el;
      if (name) {
        target = doc.querySelector(selectorOf(scene, name));
        if (!target) { note(doc, `${it.selector}: emphasis/dimension for "${name}" is not a slot of scene ${scene}; it spans its own text`); target = el; }
      }
      const span = inkSpan(target), own = boxOf(el);
      if (!span || !own) continue;
      const cs = getComputedStyle(el);
      const sp = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
      const range = doc.createRange(); range.selectNodeContents(el);
      const k = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
      const L = layoutOf({ x0: span.x0 - own.x0, x1: span.x1 - own.x0, labelW: range.getBoundingClientRect().width / k, gap: sp('--mm-space-3'), minHalf: sp('--mm-space-4') });
      // the halves may reach past the slot's own box (a headline wider than the value's column): they overflow it
      const decl = [`--mm-dim-x0: ${r2(L.x0)}px`, `--mm-dim-x1: ${r2(L.x1)}px`, `--mm-dim-g0: ${r2(L.g0)}px`, `--mm-dim-g1: ${r2(L.g1)}px`];
      if (cs.position === 'static') decl.push('position: relative');
      if (L.mode === 'gap') decl.push('justify-content: flex-start', `padding-left: ${r2(L.pad)}px`, 'padding-right: 0');
      else decl.push('--mm-dim-y: calc(100% - var(--mm-space-5) / 2)', 'padding-bottom: var(--mm-space-5)');
      rules.push(`${it.selector}[data-emphasis="emphasis/dimension"] { ${decl.join('; ')}; }`);
    }
  }
  return rules;
}

// Measures every dimension of the piece once and writes the rules; the page returns to the instant
// it was showing.
function buildSheet(doc) {
  const mm = doc.defaultView?.mm;
  if (!mm?.ready || doc.querySelector('style[data-mm-dimension]')) return;
  const sheet = doc.createElement('style');
  sheet.setAttribute('data-mm-dimension', '');
  doc.head.append(sheet);
  const back = mm.position();
  sheet.textContent = rulesOf(doc, mm).join('\n');
  mm.seek(back);
}

// Once the kit has mounted the piece (window.mm is ready and its first seek has run), measure.
if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
  const watch = new MutationObserver(() => {
    if (!document.defaultView?.mm?.ready) return;
    watch.disconnect();
    buildSheet(document);
  });
  watch.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style'] });
}

/** The draw at raw progress q of the window: { ext, grow, tick, label }, each 0 to 1. */
export function drawAt(q, ease = (x) => x) {
  const ext = smooth(q / 0.2);
  const grow = clamp01(ease(clamp01((q - 0.1) / 0.6)));
  return { ext, grow, tick: grow >= 0.999 ? 1 : 0, label: smooth((q - 0.6) / 0.25) };
}

// The beat's entrance in seconds, read from the kit's schedule; 0 when it is instant or there is no schedule.
function entranceOf(el, scene) {
  const items = el.ownerDocument?.defaultView?.mm?.schedule?.items;
  const slot = el.dataset?.slot;
  if (!Array.isArray(items) || !slot || scene == null) return 0;
  const it = items.find((x) => x.selector === selectorOf(scene, slot));
  return it && it.d > 0 ? it.d : 0;
}

export default {
  name: 'dimension',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const d = Number(ctx?.d) > 0 ? Number(ctx.d) : 0;
    const q = d && Number.isFinite(Number(ctx?.u)) ? clamp01(ctx.u / d) : clamp01(p);
    if (q >= 1 || p >= 1) return;
    const entered = entranceOf(el, ctx?.scene);
    if (entered > 0) {
      const w = el.ownerDocument?.defaultView?.mm?.warnings;
      const msg = `${selectorOf(ctx.scene, el.dataset.slot)}: emphasis/dimension on a beat with a ${entered.toFixed(2)} s entrance: the drawing arrives with the entrance and is not drawn again; give the beat params.instant: true to make the draw its arrival`;
      if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
      return;
    }
    const { ext, grow, tick, label } = drawAt(q, ctx?.ease ? (x) => ctx.ease('move', x) : undefined);
    el.style.setProperty('--mm-dim-ext', num4(ext));
    el.style.setProperty('--mm-dim-grow', num4(grow));
    el.style.setProperty('--mm-dim-tick', String(tick));
    el.style.setProperty('--mm-dim-label', num4(label));
    if (label < 1) el.style.color = `color-mix(in srgb, var(--mm-color-ink) ${(label * 100).toFixed(2)}%, transparent)`;
  },
};

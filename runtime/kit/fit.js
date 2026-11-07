// fit(el, targetPx, { max, min, line }): sets el's font-size so its widest line is targetPx wide
// (default: the element's own measure, clientWidth), clamped to [min, max] px. `line` optionally
// sets a unitless line-height. Lines are the element's explicit lines (<br> or newlines); call it
// after document.fonts.ready. Returns the font size in px.

import { safeArea } from './room.js';

const REF = 1000; // measuring size; offsetWidth rounding is then a thousandth of the result

export function fit(el, targetPx = el.clientWidth, { max = Infinity, min = 0, line = null } = {}) {
  if (line != null) el.style.lineHeight = String(line);
  const lines = (el.innerText || el.textContent || '').split('\n').filter((s) => s.trim() !== '');
  if (!lines.length || !(targetPx > 0)) return parseFloat(getComputedStyle(el).fontSize);
  const probe = el.ownerDocument.createElement('span');
  probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font-size:${REF}px;`;
  el.appendChild(probe);
  let widest = 0;
  for (const s of lines) { probe.textContent = s; widest = Math.max(widest, probe.offsetWidth); }
  probe.remove();
  if (!widest) return parseFloat(getComputedStyle(el).fontSize);
  const px = Math.min(max, Math.max(min, (REF * targetPx) / widest));
  el.style.fontSize = `${px}px`;
  return px;
}

// Room fit: a layout headline that carries `mm-fit` is sized to the room its layout leaves. The
// kit calls fitHeadline() once per scene at mount, with the scene drawn at its rest, and keeps the
// result in the scene's snapshot: the size depends on layout and copy alone, so it is the same at
// every seek and no instant depends on the one drawn before it.
const FIT_FLOOR = 0.6;   // a fitted headline keeps at least this share of its authored size
const FIT_STEP = 0.96;   // each try is 4 % smaller than the last
const TOL = 0.5;         // px; the gate's tolerance for an edge or an overlap

/**
 * shrinkToRoom(excessAt, authored, { max }): the size to draw a headline at. Tries the authored
 * size (or max px, when that is smaller), then 4 % steps down to authored × FIT_FLOOR, and returns
 * the first size whose excess (px of text past the safe area or on another slot) is 0. When none
 * is 0, the largest size whose excess is within TOL of the least found: an excess the headline does
 * not cause stays the same at every size and never shrinks it. A max below the floor is kept.
 */
export function shrinkToRoom(excessAt, authored, { max = Infinity } = {}) {
  const floor = authored * FIT_FLOOR;
  const tried = [];
  for (let px = max < authored - TOL ? max : authored; ; px = Math.max(floor, px * FIT_STEP)) {
    const e = excessAt(px);
    if (!(e > 0)) return px;
    tried.push([px, e]);
    if (px <= floor) break;
  }
  const least = Math.min(...tried.map(([, e]) => e));
  return tried.find(([, e]) => e <= least + TOL)[0];
}

const FIT = '.mm-fit[data-slot="headline"]:not([data-empty])';

// A slot's text boxes as the gate reads them at a rest: one per visible element holding text, the
// union of its own text lines, in frame px.
function textBoxes(slot) {
  const doc = slot.ownerDocument, win = doc.defaultView, r = doc.createRange();
  const stage = slot.closest('.mm-stage');
  if (!stage || !stage.offsetWidth) return [];
  const sr = stage.getBoundingClientRect(), k = sr.width / stage.offsetWidth;
  const out = [];
  for (const el of [slot, ...slot.querySelectorAll('*')]) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length || win.getComputedStyle(el).visibility !== 'visible') continue;
    let b = null;
    for (const n of own) {
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) {
        if (q.width < 0.01 && q.height < 0.01) continue;
        b = b ? { l: Math.min(b.l, q.left), t: Math.min(b.t, q.top), r: Math.max(b.r, q.right), b: Math.max(b.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom };
      }
    }
    if (b) out.push({ el, x0: (b.l - sr.left) / k, y0: (b.t - sr.top) / k, x1: (b.r - sr.left) / k, y1: (b.b - sr.top) / k });
  }
  return out;
}

// px of the headline's words that a line break splits between letters: for each piece of a word no
// break may split (a break may follow a space, a hyphen, a soft hyphen, a dash or a zero-width
// space), the width it draws past its widest line. A word wider than its column is broken by
// overflow-wrap only as a last resort. Scripts written without spaces between words (Chinese,
// Japanese, Korean, Thai) break between letters by design and are not counted.
const PIECE = /[^\s\u00ad\u200b\u2013\u2014-]+[\u00ad\u200b\u2013\u2014-]?/g;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
function brokenPx(h) {
  const doc = h.ownerDocument, walk = doc.createTreeWalker(h, 4), r = doc.createRange();
  let px = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    for (const m of n.textContent.matchAll(PIECE)) {
      if (UNSPACED.test(m[0])) continue;
      r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const qs = [...r.getClientRects()].filter((q) => q.width > 0.5);
      if (new Set(qs.map((q) => Math.round(q.top))).size < 2) continue;
      const ws = qs.map((q) => q.width);
      px += ws.reduce((a, b) => a + b, 0) - Math.max(...ws);
    }
  }
  return px;
}

// px of text outside the safe area, plus px of the headline's text on another slot's text, plus px
// of its words split between letters; each term counts only past the gate's tolerance. data-bleed may
// cross the edge; data-over may overlap.
function excess(h, others, area) {
  const mine = textBoxes(h), theirs = others.flatMap(textBoxes);
  let e = 0;
  const split = brokenPx(h);
  if (split > TOL) e += split;
  for (const b of [...mine, ...theirs]) {
    if (b.el.closest('[data-bleed]')) continue;
    const o = Math.max(area.x0 - b.x0, area.y0 - b.y0, b.x1 - area.x1, b.y1 - area.y1);
    if (o > TOL) e += o;
  }
  for (const b of theirs) {
    if (b.el.closest('[data-over]')) continue;
    for (const a of mine) {
      if (a.el.closest('[data-over]')) continue;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), hh = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > TOL && hh > TOL) e += Math.min(w, hh);
    }
  }
  return e;
}

/**
 * fitHeadline(scene, { max, least }): sizes the scene's `mm-fit` headline to its room (shrinkToRoom),
 * measured on the scene as it is drawn now, never above max px. A word split between letters counts
 * as overflow. When no size clears the other slots, the headline is marked data-fit="tight" (a layout
 * may give a tight headline more room in its CSS) and searched again; the mark stays only if it
 * helped. When a word is still split at the 0.6 floor, or the headline's text is wider than the safe
 * area, the headline keeps shrinking in the same steps until the word is whole and inside, never
 * under least px (the body floor; without least it stops at the floor). Returns { el, authored, px,
 * broken } (px is the authored size when nothing changed; el.style.fontSize is written only when it
 * did; broken is true when a word is still split or too wide), or
 * null when there is no headline or no laid-out DOM.
 */
export function fitHeadline(scene, { max = Infinity, least = Infinity } = {}) {
  const h = scene?.querySelector?.(FIT);
  if (!h || !(h.textContent || '').trim()) return null;
  const area = safeArea(h);
  if (!area || !textBoxes(h).length) return null;
  const others = [...scene.querySelectorAll('[data-slot]:not([data-empty])')]
    .filter((n) => n !== h && !n.contains(h) && !h.contains(n) && (n.textContent || '').trim());
  const was = h.style.fontSize;
  const authored = parseFloat(h.ownerDocument.defaultView.getComputedStyle(h).fontSize);
  const round = (px) => Math.round(px * 100) / 100;
  const at = (s) => { h.style.fontSize = `${round(s)}px`; return excess(h, others, area); };
  const search = () => { const px = shrinkToRoom(at, authored, { max }); return [px, at(px)]; };
  let [px, e] = search();
  if (e > 0) {
    h.dataset.fit = 'tight';
    const [px2, e2] = search();
    if (e2 < e - TOL) [px, e] = [px2, e2];
    else { delete h.dataset.fit; at(px); }
  }
  // a word still split at the floor, or too wide for the safe area (a layout that never splits a
  // word): smaller is better than broken, down to the body floor
  const wide = () => brokenPx(h) > TOL || textBoxes(h).some((b) => !b.el.closest('[data-bleed]') && Math.max(area.x0 - b.x0, b.x1 - area.x1) > TOL);
  while (wide() && px > least) { px = Math.max(least, px * FIT_STEP); at(px); }
  const broken = wide();
  if (Math.abs(px - authored) < 0.005) { h.style.fontSize = was; return { el: h, authored, px: authored, broken }; }
  h.style.fontSize = `${round(px)}px`;
  return { el: h, authored, px: round(px), broken };
}

// Word fit: a slot whose style declares `--mm-fit: word` (a stamp) is sized once per scene at mount,
// like a fitted headline, so that its longest word fits the slot's room in its own font size (the
// gate reads font sizes, so nothing scales the glyphs out of its sight). It never grows and never
// goes under the format's body floor: a word that would need to is broken in two (or more) balanced
// parts at a soft hyphen first, and the parts are sized to the room.
const BODY_FLOOR = { film: { '9x16': 44, '1x1': 40, '4x5': 42, '16x9': 36 }, deck: { '16x9': 34 } };   // SPEC §12
export const bodyFloor = (kind, format) => BODY_FLOOR[kind]?.[format] ?? BODY_FLOOR.film[format] ?? 0;
export const wantsWordFit = (el) => el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue('--mm-fit').trim() === 'word';
const SHY = '\u00ad';

// The pieces of a word no line break may split: after a hyphen or a soft hyphen the line may break.
const pieces = (word) => word.match(/[^-\u00ad]*[-\u00ad]|[^-\u00ad]+$/g) ?? [word];

// The widest the slot may be drawn, less its padding: its width forced past its max-width, which the
// max-width (or its container) then bounds; never wider than the safe area.
function roomOf(el) {
  const view = el.ownerDocument.defaultView, cs = view.getComputedStyle(el);
  const w = el.style.width;
  el.style.width = '100000px';
  const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  el.style.width = w;
  const area = safeArea(el);
  return Math.min(inner, area ? area.x1 - area.x0 : Infinity);
}

/**
 * fitWords(el, floor): sizes el (a slot holding one to a few words) so its longest word fits its
 * room, never above its authored size and never under floor px; under the floor, words too wide are
 * broken at soft hyphens into the fewest balanced parts that fit at the floor, then everything is
 * sized to the room. Writes el.style.fontSize (and hyphens: manual and the soft hyphens when it
 * breaks a word) only when something changes. Returns { el, authored, px, hyphenate } (hyphenate
 * maps a text to the same text with the soft hyphens, for the kit's snapshot), or null.
 */
export function fitWords(el, floor = 0) {
  const doc = el.ownerDocument, view = doc.defaultView;
  const text = el.textContent || '';
  if (!text.trim() || !(el.offsetWidth > 0)) return null;
  const authored = parseFloat(view.getComputedStyle(el).fontSize);
  const room = roomOf(el);
  if (!(room > 0)) return null;
  // tracking is inherited as a length, so the probe takes it again in em of its own size
  const cs = view.getComputedStyle(el), track = parseFloat(cs.letterSpacing) / authored || 0;
  const probe = doc.createElement('span');
  probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font-size:${REF}px;letter-spacing:${track}em;`;
  el.appendChild(probe);
  const width = (s) => { probe.textContent = s; return probe.offsetWidth; };
  const words = [...new Set(text.split(/\s+/).filter(Boolean))];
  const widest = Math.max(...words.flatMap((w) => pieces(w).map(width)));
  let px = Math.min(authored, (REF * room) / widest);
  const plan = new Map();
  if (px < floor) {
    // the fewest balanced parts of each over-wide piece that fit the room at the floor
    const limit = (REF * room) / floor;
    let most = 0;
    for (const w of words) {
      const out = pieces(w).map((pc) => {
        const W = width(pc);
        if (W <= limit) { most = Math.max(most, W); return pc; }
        const body = pc.replace(/[-\u00ad]$/, ''), tail = pc.slice(body.length);
        for (let k = 2; k <= body.length; k++) {
          const cuts = [];
          for (let j = 1, i = 1; j < k; j++) {
            while (i < body.length - 1 && width(body.slice(0, i + 1)) < (j * W) / k) i++;
            cuts.push(Math.max(i, (cuts.at(-1) ?? 0) + 1));
          }
          const parts = [0, ...cuts].map((c, j) => body.slice(c, cuts[j] ?? body.length));
          const ws = parts.map((q, j) => width(j < parts.length - 1 ? `${q}-` : q + tail));
          if (Math.max(...ws) <= limit || k === body.length) { most = Math.max(most, ...ws); return parts.join(SHY) + tail; }
        }
        return pc;
      }).join('');
      if (out !== w) plan.set(w, out);
    }
    px = Math.min(authored, Math.max(floor, (REF * room) / most));
  }
  probe.remove();
  const hyphenate = (s) => (plan.size ? s.replace(/\S+/g, (w) => plan.get(w) ?? w) : s);
  if (plan.size) {
    const walk = doc.createTreeWalker(el, 4);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) n.textContent = hyphenate(n.textContent);
    el.style.hyphens = 'manual';
  }
  if (authored - px < 0.005 && !plan.size) return { el, authored, px: authored, hyphenate };
  px = Math.floor(px * 100) / 100;
  el.style.fontSize = `${px}px`;
  // the measured widths are a probe's; step down while the drawn text still spills past the slot
  const spill = () => {
    const r = doc.createRange(); r.selectNodeContents(el);
    const ink = r.getBoundingClientRect(), box = el.getBoundingClientRect(), k = box.width / el.offsetWidth || 1;
    return Math.max(0, box.left - ink.left, ink.right - box.right) / k;
  };
  while (spill() > TOL && px * 0.99 >= floor) { px = Math.floor(px * 99) / 100; el.style.fontSize = `${px}px`; }
  return { el, authored, px, hyphenate };
}


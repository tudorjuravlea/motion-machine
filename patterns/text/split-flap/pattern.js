// text/split-flap: a departure-board line. Every character sits on its own tile with a hairline
// across the middle and flips through letters of the line itself before it lands on its own,
// left to right. A flip is a squash of the tile to nothing and back (scale on y), the letter
// changing at the thin point. The tiles share one width, the widest letter's. At rest the tiles
// stay as the look of the line: nothing is mid-flip, every tile shows its own letter. Writes
// text, width and scale on spans it creates; flips are seeded by the kit's random().
import { graphemesOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  flips: { type: 'number', default: 6, meaning: 'how many flips the last tile makes before it lands' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const DONE = 0.85;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'split-flap',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const lin = linear(ctx, p);
    const doc = el.ownerDocument;
    const flips = Math.max(2, Math.round(Number(prm.flips)));
    const chars = graphemesOf(text);
    const own = Array.from(new Set(chars.filter((c) => c !== ' ')));
    const letters = chars.filter((c) => c !== ' ').length;
    const rnd = ctx.random;
    const noise = Array.from({ length: letters * (flips + 1) }, () => rnd());
    el.textContent = '';
    const cells = [];
    let word = null;
    chars.forEach((ch) => {
      if (ch === ' ') { el.append(' '); word = null; return; }
      if (!word) { word = doc.createElement('span'); word.className = 'mm-split-flap__word'; el.append(word); }
      const cell = doc.createElement('span');
      cell.className = 'mm-split-flap__c';
      cell.textContent = ch;
      word.append(cell);
      cells.push({ cell, ch });
    });
    const width = Math.max(...cells.map(({ cell }) => cell.offsetWidth));
    cells.forEach(({ cell, ch }, i) => {
      cell.style.width = `${width}px`;
      const t = clamp01(lin / (DONE * ((i + 1) / cells.length)));
      if (t >= 1) return;
      const phase = t * flips;
      const k = Math.min(flips - 1, Math.floor(phase));
      const f = phase - k;
      const glyph = (j) => (j >= flips ? ch : own[Math.floor(noise[i * (flips + 1) + j] * own.length)]);
      cell.textContent = f < 0.5 ? glyph(k) : glyph(k + 1);
      cell.style.scale = `1 ${Math.abs(Math.cos(Math.PI * f)).toFixed(4)}`;
    });
  },
};

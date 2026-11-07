// text/cross-out: a list of claims is struck through one by one, each struck line dims, and the
// last item, the one that survives, is revealed or grows into its place. The beat's text is the list
// ("a|b|c|survivor"); the pattern builds the whole figure (the items and their strokes) itself on
// every seek and draws it from the entrance's linear progress, so the struck, dimmed list and the
// survivor are what the slot shows at rest: it is the beat's `fx` (an emphasis window ends and
// hands the slot back, which would unstrike the list).
// The stroke is straight, diagonal, or a scribble drawn by runtime/kit/rough.js from a seed taken
// from the slot's selector, so the same scribble is drawn at every seek. Strokes are SVG paths in
// the item's own pixels, drawn by dash offset (pathLength 1).
import { polyOf, passes } from '../../../runtime/kit/rough.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => Math.round(x * 10) / 10;
const r4 = (x) => String(Math.round(x * 10000) / 10000);
const NS = 'http://www.w3.org/2000/svg';
const IN = 0.12, STRIKE = [0.16, 0.72], LAND = [0.74, 0.96];   // the list arrives; the strikes run; the survivor lands

const params = {
  stroke: { type: 'enum(straight|diagonal|scribble)', default: 'straight', meaning: 'the stroke through a struck item: a straight line, a diagonal across its box, or a scribble drawn by rough.js' },
  survivor: { type: 'enum(reveal|grow)', default: 'reveal', meaning: 'reveal: the last item is hidden until the strikes end, then lands; grow: it shows at the size of the others and grows into its own' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the strokes (and, as accent text, of the survivor when it is accent)' },
  weight: { type: 'number', default: 0.006, meaning: 'stroke weight, as a share of the frame\'s short side, 0.002 to 0.03' },
  sep: { type: 'string', default: '|', meaning: 'what separates the items in the beat\'s text' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) && v !== '' && v != null ? n : d)); };

/** The items of a beat's text: trimmed, empty ones dropped. The last is the survivor. */
export function itemsOf(text, sep = '|') {
  return String(text ?? '').split(sep || '|').map((s) => s.trim()).filter(Boolean);
}

/**
 * The progress of the whole figure at linear time q, for `n` struck items: `arrive` (the list's
 * fade-in, 0 to 1), `strike[i]` (how much of item i is struck, 0 to 1) and `land` (the survivor's
 * arrival, 0 to 1). A strike starts when the one before it is two thirds drawn; the dimming follows
 * the strike. At q = 1 every strike is whole and the survivor has landed. Pure.
 */
export function progressAt(q, n) {
  const arrive = clamp01(q / IN), land = clamp01((q - LAND[0]) / (LAND[1] - LAND[0]));
  const span = (STRIKE[1] - STRIKE[0]) / Math.max(1, n - (n - 1) / 3);   // n strikes, each starting a third into the one before
  const strike = Array.from({ length: n }, (_, i) => clamp01((q - STRIKE[0] - (i * span * 2) / 3) / span));
  return { arrive, strike, land };
}

// The lines of text in an item, as boxes in the item's own pixels: [{ x, y, w, h }].
function linesOf(item, text) {
  const own = item.getBoundingClientRect(), k = own.width && item.offsetWidth ? own.width / item.offsetWidth : 1;
  const range = item.ownerDocument.createRange();
  range.selectNodeContents(text);
  const rows = [];
  for (const r of range.getClientRects()) {
    if (!(r.width > 0.5)) continue;
    const row = { x: (r.left - own.left) / k, y: (r.top - own.top) / k, w: r.width / k, h: r.height / k };
    const same = rows.find((o) => Math.abs(o.y - row.y) < row.h * 0.5);
    if (same) { const x1 = Math.max(same.x + same.w, row.x + row.w); same.x = Math.min(same.x, row.x); same.w = x1 - same.x; } else rows.push(row);
  }
  return rows.sort((a, b) => a.y - b.y);
}

// One line's stroke as paths in the item's pixels: [{ d, w }] (the second path of a scribble is its ghost).
function pathsOf(kind, row, pen, seed) {
  const pad = row.h * 0.12, x0 = row.x - pad, x1 = row.x + row.w + pad, mid = row.y + row.h * 0.56;
  if (kind === 'straight') return [{ d: `M${r1(x0)} ${r1(mid)}L${r1(x1)} ${r1(mid)}`, w: 1 }];
  if (kind === 'diagonal') return [{ d: `M${r1(x0)} ${r1(row.y + row.h * 0.92)}L${r1(x1)} ${r1(row.y + row.h * 0.12)}`, w: 1 }];
  const teeth = Math.max(3, Math.min(12, Math.round((x1 - x0) / (row.h * 0.8)))), top = row.y + row.h * 0.08, bottom = row.y + row.h * 0.98;
  const pts = Array.from({ length: teeth + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / teeth, i % 2 ? bottom : top]);
  const [a, b] = passes(polyOf(pts), { seed, roughness: 1.3, pen, coherent: true, wavelength: 8, ghost: 1.2 });
  return [{ d: a, w: 1 }, { d: b, w: 0.6 }];
}

export default {
  name: 'cross-out',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const items = itemsOf(el.textContent, prm.sep);
    if (items.length < 1) return;
    const q = p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const kind = ['straight', 'diagonal', 'scribble'].includes(prm.stroke) ? prm.stroke : 'straight';
    const tone = ['accent', 'ink', 'muted'].includes(prm.tone) ? prm.tone : 'accent';
    const grow = prm.survivor === 'grow';
    const doc = el.ownerDocument;
    const n = items.length - 1;
    const pr = progressAt(q, n);
    const ease = (x) => (ctx.ease ? ctx.ease('move', x) : x);
    const stage = el.closest?.('.mm-stage');
    const pen = num(prm.weight, DEFAULTS.weight, 0.002, 0.03) * Math.min(stage?.offsetWidth || 1080, stage?.offsetHeight || 1080);

    const list = doc.createElement('span');
    list.className = `mm-cross-out mm-cross-out--${tone}`;
    el.replaceChildren(list);
    const made = items.map((text, i) => {
      const item = doc.createElement('span');
      item.className = `mm-cross-out__item${i === n ? ' mm-cross-out__item--last' : ''}`;
      const t = doc.createElement('span');
      t.className = 'mm-cross-out__text';
      t.textContent = text;
      item.append(t);
      list.append(item);
      return { item, t };
    });
    const arrive = ctx.ease ? ctx.ease('enter', pr.arrive) : pr.arrive;
    const origin = getComputedStyle(list).alignItems === 'center' ? 'center' : 'left center';
    const seed = ctx.random ? Math.floor(ctx.random() * 1e9) : 7;

    made.forEach(({ item, t }, i) => {
      if (i === n) {
        // the survivor
        if (!grow) {
          const l = ease(pr.land);
          if (pr.land < 1) { item.style.opacity = r4(l); item.style.translate = `0 ${r4((1 - l) * 0.25)}em`; }
        } else {
          const from = (parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--mm-size-h2')) || 0) / (parseFloat(getComputedStyle(item).fontSize) || 1);
          const s = from > 0 && from < 1 ? from + (1 - from) * ease(pr.land) : 1;
          if (s < 0.9999) { item.style.transformOrigin = origin; item.style.scale = r4(s); item.style.opacity = r4(0.55 + 0.45 * ease(pr.land)); }
        }
        return;
      }
      if (arrive < 1) item.style.opacity = r4(arrive);
      const g = ease(pr.strike[i]);
      if (g > 0) {
        // the strike lays a stroke over the item, one path per line of text
        const svg = doc.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'mm-cross-out__stroke');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', String(item.offsetWidth)); svg.setAttribute('height', String(item.offsetHeight));
        const rows = linesOf(item, t);
        const total = rows.reduce((s, r) => s + (kind === 'diagonal' ? 1 : r.w), 0) || 1;
        let done = 0;
        for (const [j, row] of rows.entries()) {
          if (kind === 'diagonal' && j > 0) break;
          const share = kind === 'diagonal' ? 1 : row.w / total;
          const local = kind === 'diagonal' ? g : clamp01((g * total - done) / (share * total));
          done += share * total;
          if (!(local > 0)) continue;
          for (const path of pathsOf(kind, row, pen, seed + i * 31 + j * 7)) {
            const d = doc.createElementNS(NS, 'path');
            d.setAttribute('d', path.d);
            d.setAttribute('pathLength', '1');
            d.setAttribute('stroke-width', String(r1(pen * path.w * 10) / 10));
            d.style.strokeDasharray = '1 1';
            d.style.strokeDashoffset = String(Math.round((1 - local) * 10000) / 10000);
            svg.append(d);
          }
        }
        item.append(svg);
      }
      // the item dims as its strike finishes: ink to muted
      const dim = clamp01((pr.strike[i] - 0.5) / 0.5);
      if (dim > 0) t.style.color = dim >= 1 ? 'var(--mm-color-muted)' : `color-mix(in srgb, var(--mm-color-muted) ${r1(dim * 1000) / 10}%, var(--mm-color-ink))`;
    });
  },
};

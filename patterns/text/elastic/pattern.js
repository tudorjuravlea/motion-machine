// text/elastic: the line arrives stretched. A width wave starts at the middle letter and travels
// outward; each letter swells and settles back to its normal width as the wave passes, on a locked
// baseline. In a face with a width axis (`wdth`, Archivo in the kinetic preset) the letters really
// widen through font-stretch; in a face without one they scale horizontally from the baseline, so
// the line box never changes. Words never break mid-wave. At p = 1 the slot is its plain text.
import { graphemesOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  amp: { type: 'number', default: 0.22, meaning: 'peak width gain at the wave front, 0.08 to 0.25' },
};

function linear(ctx, p) {
  if (p >= 1) return 1;   // the kit calls an entrance finished within its tolerance of the end
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

// does the face answer font-stretch? (a width axis widens a run of letters measurably)
function hasWidthAxis(el) {
  const doc = el.ownerDocument;
  const probe = doc.createElement('span');
  probe.textContent = 'mmmmmmmm';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
  el.append(probe);
  const a = probe.getBoundingClientRect().width;
  probe.style.fontStretch = '125%';
  const b = probe.getBoundingClientRect().width;
  probe.remove();
  return b > a * 1.03;
}

export default {
  name: 'elastic',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const amp = Math.min(0.25, Math.max(0.08, Number(ctx.params?.amp ?? 0.22)));
    const doc = el.ownerDocument;
    const axis = hasWidthAxis(el);
    el.textContent = '';
    const letters = [];
    for (const [i, word] of text.split(' ').entries()) {
      if (i) { el.append(' '); letters.push(null); }
      const w = doc.createElement('span');
      w.className = 'mm-elastic__w';
      for (const ch of graphemesOf(word)) {
        const l = doc.createElement('span');
        l.className = 'mm-elastic__l';
        l.textContent = ch;
        w.append(l);
        letters.push(l);
      }
      el.append(w);
    }
    // distance of each letter from the middle, 0 at the centre and 1 at either end
    const n = letters.length, c = (n - 1) / 2 || 1;
    const box = el.getBoundingClientRect();
    // the front travels from the middle (q = 0) past the ends (q = 0.7); each letter's swell lasts 0.3
    for (const [i, l] of letters.entries()) {
      if (!l) continue;
      const d = Math.abs(i - (n - 1) / 2) / c;
      const local = clamp01((q - d * 0.7) / 0.3);
      const g = 1 + amp * Math.sin(Math.PI * local);
      if (g <= 1.0001) continue;
      if (axis) { l.style.fontStretch = `${(100 * g).toFixed(2)}%`; continue; }
      // scaled letters overlap their neighbours a little but never cross the slot's edge
      const r = l.getBoundingClientRect();
      const room = Math.max(0, Math.min(r.left - box.left, box.right - r.right));
      l.style.scale = `${Math.min(g, 1 + (2 * room) / (r.width || 1)).toFixed(4)} 1`;
    }
    // with a width axis the line reflows: keep it inside the slot by easing tracking while it is wide
    if (axis) el.style.letterSpacing = `calc(${getComputedStyle(el).letterSpacing === 'normal' ? '0px' : getComputedStyle(el).letterSpacing} - ${(amp * 0.25 * Math.sin(Math.PI * clamp01(q / 0.9))).toFixed(4)}em)`;
  },
};

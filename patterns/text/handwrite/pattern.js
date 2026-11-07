// text/handwrite: the line is written. Each line's glyph outlines are traced in turn with a moving
// stroke over the first 75 % of the entrance, then the fill comes in over the rest while the stroke
// fades; at p = 1 the slot is its plain text again, exactly as without the pattern. Lines are found
// from the laid-out words, so a slot that wraps traces every line. The trace follows glyph
// outlines in the style's own face: a script face reads as handwriting, any face reads as drawn.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NS = 'http://www.w3.org/2000/svg';
const DRAW = 0.75;
const r1 = (x) => Math.round(x * 10) / 10;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'handwrite',
  group: 'text',
  dur: 'slow',
  params: {
    stroke: { type: 'enum(ink|accent)', default: 'ink', meaning: 'the colour of the tracing stroke' },
  },
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const doc = el.ownerDocument;
    el.textContent = '';
    const holder = doc.createElement('span');
    holder.className = 'mm-handwrite__text';
    for (const [i, w] of text.split(' ').entries()) {
      if (i) holder.append(' ');
      const s = doc.createElement('span');
      s.className = 'mm-handwrite__w';
      s.textContent = w;
      holder.append(s);
    }
    el.append(holder);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    // the laid-out lines, from the words' boxes, in the element's own unscaled pixels
    const box = el.getBoundingClientRect();
    const k = el.offsetWidth ? box.width / el.offsetWidth : 1;
    const lines = [];
    for (const w of holder.querySelectorAll('.mm-handwrite__w')) {
      const r = w.getBoundingClientRect();
      const top = Math.round((r.top - box.top) / k);
      let line = lines.find((l) => Math.abs(l.top - top) < 2);
      if (!line) { line = { top, left: (r.left - box.left) / k, bottom: (r.bottom - box.top) / k, words: [] }; lines.push(line); }
      line.words.push(w.textContent);
    }
    const cs = getComputedStyle(holder);
    const fontPx = parseFloat(cs.fontSize);
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mm-handwrite');
    svg.setAttribute('width', String(el.offsetWidth));
    svg.setAttribute('height', String(el.offsetHeight));
    svg.setAttribute('aria-hidden', 'true');
    el.append(svg);
    const n = lines.length;
    const draw = clamp01(q / DRAW);
    for (const [i, line] of lines.entries()) {
      const t = doc.createElementNS(NS, 'text');
      t.textContent = line.words.join(' ');
      t.setAttribute('x', String(r1(line.left)));
      t.setAttribute('y', String(r1(line.bottom - fontPx * 0.22)));
      t.setAttribute('class', `mm-handwrite__line mm-handwrite__line--${ctx.params?.stroke === 'accent' ? 'accent' : 'ink'}`);
      svg.append(t);
      const len = r1(t.getComputedTextLength() * 3 + 1);
      const local = clamp01(draw * n - i);
      t.setAttribute('stroke-dasharray', String(len));
      t.setAttribute('stroke-dashoffset', String(r1(len * (1 - ctx.ease('enter', local)))));
    }
    const fill = clamp01((q - DRAW) / (1 - DRAW));
    holder.style.opacity = String(Math.round(fill * 1000) / 1000);
    svg.style.opacity = String(Math.round((1 - fill) * 1000) / 1000);
    if (fill === 0) holder.style.color = 'transparent';
  },
};

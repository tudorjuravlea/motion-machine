// entrances/assemble: the words are built from dots. Seeded dots start scattered on a ring around
// the slot and travel on spiral arcs into points sampled from the words' own letterforms; as they
// land, the real text fades in over them and the dots fade out. At p = 1 the slot is its plain text
// and the canvas is gone. The canvas is declared media (data-media), so the pixel rules mask it,
// and its text is only a sampling target drawn off screen (canvasText: true; G-LEGIBLE reads the
// DOM text, which is what rests). Every random draw comes from the slot's seed, in a fixed order.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const LAND = 0.78, LATE = 0.3;
const out3 = (x) => 1 - (1 - x) ** 3;

const params = {
  dots: { type: 'number', default: 420, meaning: 'how many dots build the words, 120 to 900' },
  color: { type: 'enum(ink|accent)', default: 'ink', meaning: 'the dots\' colour' },
};

function linear(ctx, p) {
  if (p >= 1) return 1;   // the kit calls an entrance finished within its tolerance of the end
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'assemble',
  group: 'entrances',
  dur: 'slow',
  canvasText: true,
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const doc = el.ownerDocument;
    el.textContent = '';
    const holder = doc.createElement('span');
    holder.className = 'mm-assemble__text';
    for (const [i, w] of text.split(' ').entries()) {
      if (i) holder.append(' ');
      const s = doc.createElement('span');
      s.textContent = w;
      holder.append(s);
    }
    el.append(holder);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const W = el.offsetWidth, H = el.offsetHeight;
    if (!W || !H) return;
    const box = el.getBoundingClientRect(), k = box.width / W || 1;
    const cs = getComputedStyle(holder);
    const fontPx = parseFloat(cs.fontSize);
    // the sampling target: each word drawn off screen at its own laid-out box, in the slot's face and
    // tracking, read once on a coarse grid
    const M = Math.round(fontPx);                                  // the canvas reaches this far past the slot
    const off = doc.createElement('canvas');
    off.width = W; off.height = H;
    const g = off.getContext('2d', { willReadFrequently: true });
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
    if (cs.letterSpacing !== 'normal') g.letterSpacing = cs.letterSpacing;
    g.textBaseline = 'alphabetic';
    for (const w of holder.children) {
      const r = w.getBoundingClientRect();
      g.fillText(w.textContent, (r.left - box.left) / k, (r.bottom - box.top) / k - fontPx * 0.22);
    }
    const px = g.getImageData(0, 0, W, H).data;
    const step = Math.max(2, Math.round(fontPx / 18));
    const spots = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (px[(y * W + x) * 4 + 3] > 128) spots.push([x, y]);
    if (!spots.length) return;
    const rnd = ctx.random;
    const n = Math.min(900, Math.max(120, Math.round(Number(ctx.params?.dots ?? 420))));
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) * 0.62;
    const canvas = doc.createElement('canvas');
    canvas.className = 'mm-assemble';
    canvas.setAttribute('data-media', '');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = W + 2 * M; canvas.height = H + 2 * M;
    canvas.style.left = `${-M}px`; canvas.style.top = `${-M}px`;
    el.append(canvas);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.fillStyle = ctx.params?.color === 'accent' ? getComputedStyle(el).getPropertyValue('--mm-color-accent').trim() || cs.color : cs.color;
    const fade = clamp01((q - LAND) / (1 - LAND));
    c.globalAlpha = 1 - fade;
    const dot = Math.max(1.5, fontPx * 0.045);
    for (let i = 0; i < n; i++) {
      // five draws per dot, always in this order, so the scatter is one fixed layout
      const [tx, ty] = spots[Math.floor(rnd() * spots.length)];
      const a0 = rnd() * Math.PI * 2, r0 = R * (0.75 + rnd() * 0.5), late = rnd() * LATE, spin = (rnd() - 0.5) * Math.PI;
      const e = out3(clamp01((q / LAND - late) / (1 - LATE)));
      const a1 = Math.atan2(ty - cy, tx - cx), r1 = Math.hypot(tx - cx, ty - cy);
      const ang = a0 + (a1 - a0) * e + spin * e * (1 - e);   // a spiral: an extra turn that is gone on landing
      const r = r0 + (r1 - r0) * e;
      c.beginPath();
      c.arc(M + cx + Math.cos(ang) * r, M + cy + Math.sin(ang) * r, dot, 0, Math.PI * 2);
      c.fill();
    }
    holder.style.opacity = fade.toFixed(4);
  },
};

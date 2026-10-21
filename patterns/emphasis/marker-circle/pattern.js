// emphasis/marker-circle: a ring is drawn around the element by hand, a little more than one turn
// with a wobble, holds while the eye lands, then lifts away. The wobble is seeded from the slot, so
// the same ring is drawn at every seek. Writes an SVG inside the slot (and position: relative on a
// static slot); at p = 0 and p = 1 it writes nothing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NS = 'http://www.w3.org/2000/svg';
const DRAW = 0.45, LIFT = 0.85, SEG = 72;
const r1 = (x) => Math.round(x * 10) / 10;

const params = {
  color: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the marker colour' },
  pad: { type: 'number', default: 0.18, meaning: 'how far the ring clears the element, in its heights, 0.08 to 0.4' },
};

export default {
  name: 'marker-circle',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    // phases run on the beat's own clock (the kit eases p for emphasis; the phases set their own easing)
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q <= 0 || q >= 1 || p <= 0 || p >= 1) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const pad = Math.min(0.4, Math.max(0.08, Number(ctx.params?.pad ?? 0.18))) * h;
    const rnd = ctx.random;
    const ph = [rnd(), rnd(), rnd()].map((x) => x * Math.PI * 2);
    const a0 = -Math.PI * (0.62 + rnd() * 0.12);
    // ring the laid-out text, not the slot's whole column: the union of the content's line boxes
    const box = el.getBoundingClientRect(), k = box.width / w || 1;
    const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
    const rs = [...range.getClientRects()].filter((r) => r.width > 0);
    const L = rs.length ? (Math.min(...rs.map((r) => r.left)) - box.left) / k : 0, R = rs.length ? (Math.max(...rs.map((r) => r.right)) - box.left) / k : w;
    const T = rs.length ? (Math.min(...rs.map((r) => r.top)) - box.top) / k : 0, B = rs.length ? (Math.max(...rs.map((r) => r.bottom)) - box.top) / k : h;
    // an ellipse that clears the text box's corners: ry first, then rx from (W/rx)² + (H/ry)² = 1
    const W = (R - L) / 2, H = (B - T) / 2;
    const cx = (L + R) / 2, cy = (T + B) / 2, ry = H * 1.25 + pad, rx = (W / Math.sqrt(1 - (H / ry) ** 2)) * 0.98 + pad * 0.5;
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, a = a0 + u * Math.PI * 2 * 1.08;
      const k = 1 + 0.035 * Math.sin(a * 2 + ph[0]) + 0.02 * Math.sin(a * 3 + ph[1]) + 0.05 * u * Math.sin(ph[2]);
      pts.push(`${r1(cx + Math.cos(a) * rx * k)} ${r1(cy + Math.sin(a) * ry * k)}`);
    }
    const doc = el.ownerDocument;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', `mm-marker-circle mm-marker-circle--${ctx.params?.color === 'ink' ? 'ink' : 'accent'}`);
    svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${pts.join(' L ')}`);
    svg.append(path);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.append(svg);
    const len = r1(path.getTotalLength() + 1);
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(r1(len * (1 - ctx.ease('move', clamp01(q / DRAW)))));
    if (q > LIFT) svg.style.opacity = (1 - (q - LIFT) / (1 - LIFT)).toFixed(4);
  },
};

// data/pyramid: two to six levels, written top to bottom, that stack up (or down) one after another.
// Variants: `pyramid` (a truncated triangle cut into bands, apex up), `funnel-up` (the same bands
// apex down: a funnel that fills from its narrow end) and `layers` (slabs in shallow perspective,
// each a little off the one above, labelled at the side). At p = 1 the slot is the still diagram.
// Labels are DOM text; bands, slabs and leaders are SVG in the stage's own pixels.
import { LOOK, svgEl, clock, drawn, f2, items, layer, node, path, place, pop, reveal, span, stage } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'two to six levels, written top to bottom, separated by `|`, `>` or `,`' },
  variant: { type: 'enum(pyramid|funnel-up|layers)', default: 'pyramid', meaning: 'pyramid: bands, apex up; funnel-up: bands, apex down; layers: slabs in shallow perspective' },
  order: { type: 'enum(bottom-up|top-down)', default: 'bottom-up', meaning: 'which level arrives first (the others follow in turn)' },
  hero: { type: 'number', default: 1, meaning: 'which level (1 = the first written, the top) takes the accent; 0 for none' },
  ...LOOK,
};
const poly = (s, parent, pts, cls) => {
  const e = svgEl(s.doc, 'polygon');
  e.setAttribute('class', cls);
  e.setAttribute('points', pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' '));
  parent.append(e);
  return e;
};
const group = (s, parent) => { const g = svgEl(s.doc, 'g'); parent.append(g); return g; };

export default {
  name: 'pyramid',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const list = items(prm.nodes).slice(0, 6), N = list.length;
    const s = stage(el, 'pyr', prm);
    if (N < 2) { el.replaceChildren(); return; }
    const variant = ['pyramid', 'funnel-up', 'layers'].includes(prm.variant) ? prm.variant : 'pyramid';
    s.root.dataset.variant = variant;
    const q = clock(p, ctx);
    const { W, H } = s;
    const hero = Math.round(Number(prm.hero) || 0);
    const up = prm.order !== 'top-down';
    const svg = layer(s);
    // level k arrives over its own window; the first to arrive is the bottom one (or the top)
    const when = (k) => { const r = up ? N - 1 - k : k, a = 0.04 + r * (0.6 / N); return span(q, a, a + 0.4); };

    if (variant === 'layers') {
      const Ws = Math.min(W * 0.5, H * 1.15), sx = W * 0.27;
      const total = H / (1.35 * N - 0.35), dh = Math.min(total * 0.74, Ws * 0.3), t = total * 0.26;
      const pitch = N > 1 ? (H - dh - t) / (N - 1) : 0;
      for (let k = N - 1; k >= 0; k--) {   // the lowest first, so the upper slab is drawn over it
        const cx = sx + (k - (N - 1) / 2) * Ws * 0.06, y = k * pitch, x = when(k), m = ctx.ease('enter', x);
        const g = group(s, svg);
        const top = [[cx, y], [cx + Ws / 2, y + dh / 2], [cx, y + dh], [cx - Ws / 2, y + dh / 2]];
        const left = [[cx - Ws / 2, y + dh / 2], [cx, y + dh], [cx, y + dh + t], [cx - Ws / 2, y + dh / 2 + t]];
        const right = [[cx + Ws / 2, y + dh / 2], [cx, y + dh], [cx, y + dh + t], [cx + Ws / 2, y + dh / 2 + t]];
        const kind = k + 1 === hero ? 'mm-pyr__face--hero' : '';
        poly(s, g, left, `mm-dg__edge mm-pyr__face ${kind}`); poly(s, g, left, 'mm-pyr__shade mm-pyr__shade--l');
        poly(s, g, right, `mm-dg__edge mm-pyr__face ${kind}`); poly(s, g, right, 'mm-pyr__shade mm-pyr__shade--r');
        poly(s, g, top, `mm-dg__edge mm-pyr__face ${kind}`);
        if (x <= 0) g.style.visibility = 'hidden';
        else if (x < 1) { g.style.translate = `0 ${f2(-(1 - m) * H * 0.07)}px`; g.style.opacity = f2(Math.min(1, x * 3)); }
        // the label beside the slab, joined to it by a short line
        const lx = sx + Ws / 2 + (N - 1) * Ws * 0.03 + W * 0.06, ly = y + (dh + t) / 2;
        const nd = node(s, list[k], 0, ly, { bare: true, hero: k + 1 === hero, maxW: W - lx });
        place(nd, lx + nd.w / 2, ly);
        const ex = cx + Ws / 2, lead = path(s, svg, `M ${f2(ex)} ${f2(y + dh / 2 + t / 2)} L ${f2(lx - W * 0.015)} ${f2(ly)}`);
        drawn(lead, span(x, 0.4, 1));
        reveal(nd, span(x, 0.4, 1), ctx);
      }
      return;
    }

    // bands: a truncated triangle (apex up) or its inverse (apex down), cut into N bands with a gap
    const Wb = W * 0.96, top = Wb * 0.3, cx = W / 2, gap = Math.min(H * 0.014, 14);
    const bh = (H - (N - 1) * gap) / N;
    const hw = (y) => (variant === 'pyramid' ? top + ((Wb - top) * y) / H : Wb - ((Wb - top) * y) / H) / 2;
    const rr = Math.min(parseFloat(getComputedStyle(s.root).getPropertyValue('--dg-radius')) || 0, bh * 0.3);
    list.forEach((t, k) => {
      const y0 = k * (bh + gap), y1 = y0 + bh, x = when(k);
      const a = (y) => hw(y) - rr * 1.1;
      const band = poly(s, svg, [[cx - a(y0 + rr), y0 + rr], [cx + a(y0 + rr), y0 + rr], [cx + a(y1 - rr), y1 - rr], [cx - a(y1 - rr), y1 - rr]], `mm-pyr__band${k + 1 === hero ? ' mm-pyr__band--hero' : ''}`);
      band.style.strokeWidth = `${f2(2 * rr)}px`;
      if (x <= 0) band.style.visibility = 'hidden';
      else if (x < 1) { band.style.scale = f2(0.5 + 0.5 * pop(ctx, x)); band.style.opacity = f2(Math.min(1, x * 3)); }
      const mid = (y0 + y1) / 2;
      reveal(node(s, t, cx, mid, { bare: true, hero: k + 1 === hero, maxW: hw(mid) * 2 * 0.8 }), span(x, 0.35, 1), ctx);
    });
  },
};

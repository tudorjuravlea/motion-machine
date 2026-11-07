// data/venn: two or three circles scale in, drawing together until they overlap, each with its set
// name; the overlap lands last, as a tinted lens and a label. At p = 1 the slot is the still
// diagram. Set names and the overlap label are DOM text; circles are SVG in the stage's own pixels.
import { LOOK, svgEl, clock, f2, items, layer, node, reveal, span, stage, pop } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'two or three set names, separated by `|`, `>` or `,` ("Design|Code|Data")' },
  overlap: { type: 'string', default: '', meaning: 'the label of the overlap (of all the circles), which lands last; empty for none' },
  ...LOOK,
};
const LAG = 0.14, GROW = 0.4;   // each circle starts a little after the one before and takes this share of the beat

export default {
  name: 'venn',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const list = items(prm.nodes).slice(0, 3), n = list.length;
    const s = stage(el, 'venn', prm);
    if (n < 2) { el.replaceChildren(); return; }
    const q = clock(p, ctx);
    const { W, H } = s;
    const three = n === 3;
    // the circles' radius, and where they sit when done: two side by side, three round a point
    const r = (three ? Math.min(W / 2.95, H / 2.825) : Math.min(W / 3, H / 2)) * 0.96;
    const rho = three ? r * 0.55 : r / 2;
    const gx = W / 2, gy = three ? H / 2 + r * 0.1375 : H / 2;
    const dirs = three ? [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6].map((a) => [Math.cos(a), Math.sin(a)]) : [[-1, 0], [1, 0]];
    const final = dirs.map(([ux, uy]) => [gx + ux * rho, gy + uy * rho]);
    const svg = layer(s);
    const id = `mm-venn-${ctx.scene ?? ''}-${el.getAttribute('data-slot') ?? ''}`;
    const circle = (parent, cx, cy, rr, cls) => {
      const c = svgEl(s.doc, 'circle');
      c.setAttribute('class', cls); c.setAttribute('cx', f2(cx)); c.setAttribute('cy', f2(cy)); c.setAttribute('r', f2(rr));
      parent.append(c);
      return c;
    };
    list.forEach((_, k) => {
      const x = span(q, k * LAG, k * LAG + GROW), m = ctx.ease('enter', x);
      if (x <= 0) return;
      const c = circle(svg, gx + (final[k][0] - gx) * (1 + 0.35 * (1 - m)), gy + (final[k][1] - gy) * (1 + 0.35 * (1 - m)), r * (0.25 + 0.75 * pop(ctx, x)), `mm-dg__edge mm-venn__disc mm-venn__disc--${k}`);
      if (x < 1) c.style.opacity = f2(Math.min(1, x * 3));
    });
    // each set's name, in the part of its circle the others do not cover
    list.forEach((t, k) => {
      const [ux, uy] = dirs[k], dist = rho + r * (three ? 0.62 : 0.5);
      const nd = node(s, t, gx + ux * dist, gy + uy * dist, { bare: true, maxW: r * (three ? 1.15 : 0.9) });
      reveal(nd, span(q, k * LAG + 0.25, k * LAG + 0.55), ctx);
    });
    const o = String(prm.overlap ?? '').trim();
    const lens = span(q, 0.7, 0.98);
    if (lens > 0) {
      // the overlap: the last circle cut by each of the others, tinted, then its label
      const defs = svgEl(s.doc, 'defs');
      svg.append(defs);
      let host = svg;
      final.slice(0, n - 1).forEach(([cx, cy], k) => {
        const cp = svgEl(s.doc, 'clipPath');
        cp.setAttribute('id', `${id}-${k}`);
        circle(cp, cx, cy, r, '');
        defs.append(cp);
        const g = svgEl(s.doc, 'g');
        g.setAttribute('clip-path', `url(#${id}-${k})`);
        host.append(g);
        host = g;
      });
      const c = circle(host, final[n - 1][0], final[n - 1][1], r, 'mm-venn__lens');
      if (lens < 1) c.style.opacity = f2(ctx.ease('enter', lens));
      if (o) reveal(node(s, o, gx, gy, { hero: true, maxW: r * (three ? 1.6 : 1.2) }), span(lens, 0.3, 1), ctx);
    }
  },
};

// data/cycle: two to eight nodes on a ring. The first lands, then an arc draws from each node to the
// next with an arrow head riding its tip, and the next node springs in as the arc arrives; the last
// arc closes the ring back on the first. An optional centre label settles in at the end. At p = 1
// the slot is the still ring. Nodes are DOM text; arcs and heads are SVG in the stage's own pixels.
import { LOOK, clock, drawn, f2, head, items, layer, node, path, place, reveal, span, stage } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'two to eight steps in order, separated by `|`, `>` or `,` ("Plan|Do|Check|Act")' },
  hero: { type: 'number', default: 0, meaning: 'which node (1 = the first) takes the accent plate; 0 for none' },
  centre: { type: 'string', default: '', meaning: 'a short label in the middle of the ring, settling in last' },
  ...LOOK,
};
const FIRST = 0.1;   // the first node arrives over this share of the beat; each arc then gets an equal share of the rest

export default {
  name: 'cycle',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const list = items(prm.nodes).slice(0, 8), n = list.length;
    const s = stage(el, 'cycle', prm);
    if (n < 2) { el.replaceChildren(); return; }
    const q = clock(p, ctx);
    const { W, H } = s;
    const hero = Math.round(Number(prm.hero) || 0);
    const svg = layer(s);
    const nds = list.map((t, k) => node(s, t, W / 2, H / 2, { hero: k + 1 === hero, maxW: W * 0.34 }));
    const R = Math.max(40, Math.min(W / 2 - Math.max(...nds.map((d) => d.w)) / 2, H / 2 - Math.max(...nds.map((d) => d.h)) / 2));
    const th = (k) => -Math.PI / 2 + (2 * Math.PI * k) / n;
    nds.forEach((d, k) => place(d, W / 2 + R * Math.cos(th(k)), H / 2 + R * Math.sin(th(k))));
    // the angle a node's box takes up along the ring, with a little air, so an arc starts and ends beside it
    const pad = Math.min(W, H) * 0.014;
    const half = (d, k) => (Math.abs(Math.sin(th(k))) * d.w / 2 + Math.abs(Math.cos(th(k))) * d.h / 2 + pad) / R;
    const sz = (1 - FIRST) / n;
    const hs = s.linePx * 5;
    reveal(nds[0], span(q, 0, FIRST), ctx);
    for (let k = 0; k < n; k++) {
      const a0 = th(k) + half(nds[k], k), a1 = th(k + 1) - half(nds[(k + 1) % n], k + 1);
      if (a1 <= a0) continue;
      const at = (a) => [W / 2 + R * Math.cos(a), H / 2 + R * Math.sin(a)];
      const [x0, y0] = at(a0), [x1, y1] = at(a1);
      const u = span(q, FIRST + k * sz, FIRST + k * sz + sz * 0.75), m = ctx.ease('move', u);
      drawn(path(s, svg, `M ${f2(x0)} ${f2(y0)} A ${f2(R)} ${f2(R)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`, 'accent'), m);
      if (m > 0) { const a = a0 + (a1 - a0) * m, [hx, hy] = at(a); head(s, svg, hx, hy, a + Math.PI / 2, hs); }
      if (k + 1 < n) reveal(nds[k + 1], span(q, FIRST + k * sz + sz * 0.55, FIRST + (k + 1) * sz), ctx);
    }
    const c = String(prm.centre ?? '').trim();
    if (c) {
      const d = s.doc.createElement('div');
      d.className = 'mm-cycle__centre';
      d.textContent = c;
      d.style.maxWidth = `${f2(R * 1.1)}px`;
      const v = ctx.ease('enter', span(q, 0.8, 1));
      if (v < 1) d.style.opacity = f2(v);
      s.stage.append(d);
    }
  },
};

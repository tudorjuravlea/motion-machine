// data/org-chart: a root, a stem, a rail and branches that draw down, and child nodes that spring
// in level by level. Variants: `chart` (top down: stem, rail, branches), `tree` (the same left to
// right) and `mind-map` (the root in the centre, spokes that radiate, nodes around). At p = 1 the
// slot is the still diagram. Nodes are DOM text (every legibility check reads them); lines are SVG
// in the stage's own pixels. The text grammar is runtime/kit/diagram.js's `parseTree`.
import { LOOK, clock, drawn, f2, layer, node, parseTree, path, place, reveal, separate, span, stage } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'the tree: `|` between groups, a leading `>` per level deeper, `,` between siblings (or indented lines, two spaces a level); one root, at most 16 nodes' },
  variant: { type: 'enum(chart|tree|mind-map)', default: 'chart', meaning: 'chart: top down with a stem, a rail and branches; tree: left to right; mind-map: the root in the middle, spokes around it' },
  hero: { type: 'number', default: 1, meaning: 'which node (1 = the first written, the root) takes the accent plate; 0 for none' },
  ...LOOK,
};
const ROOT_AT = 0.12;                                  // the root arrives first, over this share of the beat
const STEM = [0, 0.3], RAIL = [0.25, 0.6], BRANCH = [0.5, 0.8];   // a level's lines, in its own 0..1
const popAt = (u, i, n) => { const a = 0.6 + 0.12 * (n > 1 ? i / (n - 1) : 0); return span(u, a, a + 0.28); };

// where the segment from the centre of a box towards (tx, ty) leaves the box
function leave(nd, tx, ty) {
  const dx = tx - nd.cx, dy = ty - nd.cy;
  const k = Math.min(dx ? nd.w / 2 / Math.abs(dx) : Infinity, dy ? nd.h / 2 / Math.abs(dy) : Infinity);
  return [nd.cx + dx * Math.min(k, 1), nd.cy + dy * Math.min(k, 1)];
}

export default {
  name: 'org-chart',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const tree = parseTree(prm.nodes);
    const s = stage(el, 'org', prm);
    if (!tree.length) { el.replaceChildren(); return; }
    const variant = ['chart', 'tree', 'mind-map'].includes(prm.variant) ? prm.variant : 'chart';
    s.root.dataset.variant = variant;
    const q = clock(p, ctx);
    const { W, H } = s;
    const hero = Math.round(Number(prm.hero) || 0);
    const D = Math.max(...tree.map((n) => n.depth));
    const sz = (1 - ROOT_AT) / Math.max(D, 1);
    const step = (k) => span(q, ROOT_AT + (k - 1) * sz, ROOT_AT + k * sz);
    const rank = tree.map((n) => tree.filter((m) => m.depth === n.depth).indexOf(n));
    const count = (d) => tree.filter((m) => m.depth === d).length;
    const svg = layer(s);
    const mk = (n, x, y, maxW) => Object.assign(n, { nd: node(s, n.text, x, y, { hero: n.i + 1 === hero, maxW }) });

    if (variant === 'mind-map') {
      mk(tree[0], W / 2, H / 2, W * 0.3);
      const spokes = tree[0].children, k = spokes.length;
      const a0 = k === 1 ? 0 : k % 2 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / k;
      const onRing = (n, a, rx, ry) => mk(n, W / 2 + Math.cos(a) * rx, H / 2 + Math.sin(a) * ry, W * 0.3);
      spokes.forEach((n, i) => {
        const a = a0 + (i * 2 * Math.PI) / Math.max(k, 1);
        onRing(n, a, W * 0.29, H * 0.27);
        n.angle = a;
      });
      for (const n of tree.filter((m) => m.depth >= 2)) {
        const sib = n.parent.children, j = sib.indexOf(n);
        const a = (n.parent.angle ?? 0) + (j - (sib.length - 1) / 2) * Math.min(0.5, (2 * Math.PI / Math.max(k, 1)) * 0.8 / sib.length);
        n.angle = a;
        onRing(n, a, W * 0.43, H * 0.42);
      }
      // nodes whose boxes meet are pushed apart, then every node is where its box now is
      const moved = separate(tree.map((n, i) => ({ x: n.nd.cx, y: n.nd.cy, w: n.nd.w, h: n.nd.h, fixed: i === 0 })), { w: W, h: H }, 12);
      tree.forEach((n, i) => place(n.nd, moved[i].x, moved[i].y));
      reveal(tree[0].nd, span(q, 0, ROOT_AT), ctx);
      for (const n of tree.slice(1)) {
        const u = step(n.depth), i = rank[n.i], c = count(n.depth);
        const [x0, y0] = leave(n.parent.nd, n.nd.cx, n.nd.cy), [x1, y1] = leave(n.nd, n.parent.nd.cx, n.parent.nd.cy);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const bend = len * 0.1;
        const e = path(s, svg, `M ${f2(x0)} ${f2(y0)} Q ${f2(mx - ((y1 - y0) / len) * bend)} ${f2(my + ((x1 - x0) / len) * bend)} ${f2(x1)} ${f2(y1)}`);
        drawn(e, span(u, 0, 0.55));
        const a = 0.4 + 0.12 * (c > 1 ? i / (c - 1) : 0);
        reveal(n.nd, span(u, a, a + 0.48), ctx);
      }
      return;
    }

    // chart (depth runs down) and tree (depth runs right): one layout in (along, across)
    const down = variant === 'chart';
    const across = down ? W : H, along = down ? H : W;
    const leaves = tree.filter((n) => !n.children.length);
    leaves.forEach((n, i) => { n.v = ((i + 0.5) * across) / leaves.length; });
    for (let i = tree.length - 1; i >= 0; i--) { const n = tree[i]; if (n.children.length) n.v = (n.children[0].v + n.children.at(-1).v) / 2; }
    const levels = D + 1, row = (d) => (along * (d + 0.5)) / levels;
    const slot = across / leaves.length, colW = (W / levels) * 0.86;
    // a node may be as wide as the leaves under it: its siblings' leaves are never in its way
    for (let i = tree.length - 1; i >= 0; i--) { const n = tree[i]; n.leafCount = n.children.length ? n.children.reduce((a, c) => a + c.leafCount, 0) : 1; }
    const P = (u, v) => (down ? [v, u] : [u, v]);
    for (const n of tree) { const [x, y] = P(row(n.depth), n.v); mk(n, x, y, down ? slot * n.leafCount * 0.96 : colW); n.half = (down ? n.nd.h : n.nd.w) / 2; }
    const ext = Array.from({ length: levels }, (_, d) => Math.max(...tree.filter((n) => n.depth === d).map((n) => n.half)));
    const line = (a, b, mod) => { const [x0, y0] = P(a[0], a[1]), [x1, y1] = P(b[0], b[1]); return path(s, svg, `M ${f2(x0)} ${f2(y0)} L ${f2(x1)} ${f2(y1)}`, mod); };
    reveal(tree[0].nd, span(q, 0, ROOT_AT), ctx);
    for (const n of tree.filter((m) => m.children.length)) {
      const kids = n.children, d = n.depth, u = step(d + 1);
      const u0 = row(d) + n.half, rail = (row(d) + ext[d] + row(d + 1) - ext[d + 1]) / 2;
      const lo = kids[0].v, hi = kids.at(-1).v;
      if (kids.length === 1 && lo === n.v) {
        drawn(line([u0, n.v], [row(d + 1) - kids[0].half, n.v]), span(u, STEM[0], BRANCH[1]));
      } else {
        drawn(line([u0, n.v], [rail, n.v]), span(u, ...STEM));
        if (lo < n.v) drawn(line([rail, n.v], [rail, lo]), span(u, ...RAIL));
        if (hi > n.v) drawn(line([rail, n.v], [rail, hi]), span(u, ...RAIL));
        for (const c of kids) drawn(line([rail, c.v], [row(d + 1) - c.half, c.v]), span(u, ...BRANCH));
      }
    }
    for (const n of tree.slice(1)) reveal(n.nd, popAt(step(n.depth), rank[n.i], count(n.depth)), ctx);
  },
};

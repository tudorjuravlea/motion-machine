// data/matrix: a 2x2 with two axis labels. The axes and the four cells arrive, then the items drop
// into their quadrants in reading order; one quadrant can be the hero and take the accent. At p = 1
// the slot is the still matrix. Names, items and axis labels are DOM text; the cells and the axis
// arrows are SVG in the stage's own pixels. A row of cells grows to hold its items rather than
// letting them spill.
import { LOOK, svgEl, clock, drawn, f2, head, layer, node, path, place, pop, reveal, span, stage } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'four quadrants in reading order (top left, top right, bottom left, bottom right) separated by `|`, each `Name>item,item` (up to three items)' },
  x: { type: 'string', default: '', meaning: 'the label of the horizontal axis, under the grid on the right' },
  y: { type: 'string', default: '', meaning: 'the label of the vertical axis, above the grid on the left' },
  hero: { type: 'number', default: 0, meaning: 'which quadrant (1 to 4, in reading order) takes the accent; 0 for none' },
  ...LOOK,
};

export default {
  name: 'matrix',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const quads = String(prm.nodes ?? '').split(/\||\n/).map((t) => t.trim()).filter(Boolean).slice(0, 4).map((t) => {
      const [name, rest = ''] = t.split('>');
      return { name: name.trim(), items: rest.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3) };
    });
    const s = stage(el, 'matrix', prm);
    if (quads.length < 4) { el.replaceChildren(); return; }
    const q = clock(p, ctx);
    const { W } = s;
    let H = s.H;
    const hero = Math.round(Number(prm.hero) || 0);
    const lw = s.linePx, arrow = lw * 5;
    const gap = Math.max(lw * 3, 8), pad = Math.max(gap, Math.min(W, s.H) * 0.02);
    const cw = (W - gap) / 2;

    // measure first: the axis labels, then each cell's name and items, flowed left to right inside the cell
    const axis = (text) => {
      const t = String(text ?? '').trim();
      if (!t) return null;
      const nd = node(s, t, 0, 0, { bare: true, maxW: W * 0.7 });
      nd.el.classList.add('mm-matrix__axis');
      return nd;
    };
    const ay = axis(prm.y), ax = axis(prm.x);
    const top = ay ? ay.h + pad : 0, bottom = ax ? ax.h + pad : 0;
    const cells = quads.map((qd, i) => {
      const isHero = i + 1 === hero;
      const title = node(s, qd.name, 0, 0, { bare: true, hero: isHero, maxW: cw - 2 * pad });
      title.el.classList.add('mm-matrix__title');
      let cx = pad, cy = pad / 2 + title.h + pad / 2, rowH = 0;
      const chips = qd.items.map((t) => {
        const chip = node(s, t, 0, 0, { soft: !isHero, maxW: cw - 2 * pad });
        chip.el.classList.add('mm-matrix__chip');
        if (isHero) chip.el.classList.add('mm-matrix__chip--onhero');
        if (cx + chip.w > cw - pad + 0.5 && cx > pad) { cx = pad; cy += rowH + pad / 2; rowH = 0; }
        chip.rel = [cx + chip.w / 2, cy + chip.h / 2];
        cx += chip.w + pad / 2; rowH = Math.max(rowH, chip.h);
        return chip;
      });
      return { title, chips, isHero, h: cy + rowH + pad };
    });
    const natural = (H - top - bottom - gap) / 2;
    const rows = [Math.max(natural, cells[0].h, cells[1].h), Math.max(natural, cells[2].h, cells[3].h)];
    const total = top + bottom + gap + rows[0] + rows[1];
    if (total > H + 0.5) { s.stage.style.height = `${f2(total)}px`; H = total; }
    s.H = H;
    const svg = layer(s);
    const rr = Math.min(parseFloat(getComputedStyle(s.root).getPropertyValue('--dg-radius')) || 0, Math.min(rows[0], rows[1]) * 0.12);
    const k0 = [0, 0, 0, 0].map((_, i) => cells.slice(0, i).reduce((n, c) => n + c.chips.length, 0));

    // the axes, each with a small arrow
    const axes = span(q, 0, 0.2);
    if (ay) {
      const len = ay.h * 0.9, cy = ay.h / 2;
      place(ay, len + pad + ay.w / 2, cy);
      drawn(path(s, svg, `M ${f2(lw)} ${f2(cy + len / 2)} L ${f2(lw)} ${f2(cy - len / 2 + arrow * 0.6)}`, 'accent'), ctx.ease('move', axes));
      if (axes > 0.5) head(s, svg, lw, cy - len / 2, -Math.PI / 2, arrow);
      reveal(ay, axes, ctx);
    }
    if (ax) {
      const len = ax.h * 1.6, cy = H - ax.h / 2;
      place(ax, W - len - pad - ax.w / 2, cy);
      drawn(path(s, svg, `M ${f2(W - len)} ${f2(cy)} L ${f2(W - lw - arrow * 0.6)} ${f2(cy)}`, 'accent'), ctx.ease('move', axes));
      if (axes > 0.5) head(s, svg, W - lw, cy, 0, arrow);
      reveal(ax, axes, ctx);
    }

    // the cells, then their names and items
    const total0 = cells.reduce((n, c) => n + c.chips.length, 0);
    cells.forEach((c, i) => {
      const x0 = (i % 2) * (cw + gap), y0 = top + (i < 2 ? 0 : rows[0] + gap), ch = rows[i < 2 ? 0 : 1];
      const x = span(q, 0.08 + i * 0.05, 0.38 + i * 0.05);
      const r = svgEl(s.doc, 'rect');
      r.setAttribute('class', `mm-matrix__cell${c.isHero ? ' mm-matrix__cell--hero' : ''}`);
      for (const [a, v] of [['x', x0 + rr], ['y', y0 + rr], ['width', cw - 2 * rr], ['height', ch - 2 * rr], ['rx', rr]]) r.setAttribute(a, f2(v));
      r.style.strokeWidth = `${f2(2 * rr)}px`;
      if (x <= 0) r.style.visibility = 'hidden';
      else if (x < 1) { r.style.scale = f2(0.9 + 0.1 * pop(ctx, x)); r.style.opacity = f2(Math.min(1, x * 3)); }
      svg.append(r);
      place(c.title, x0 + pad + c.title.w / 2, y0 + pad / 2 + c.title.h / 2);
      reveal(c.title, span(x, 0.4, 1), ctx);
      c.chips.forEach((chip, j) => {
        place(chip, x0 + chip.rel[0], y0 + chip.rel[1]);
        const a = 0.35 + (0.45 * (k0[i] + j)) / total0, w = span(q, a, a + 0.2);
        reveal(chip, w, ctx);
        if (w > 0 && w < 1) chip.el.style.translate = `0 ${f2(-(1 - ctx.ease('enter', w)) * chip.h * 0.9)}px`;
      });
    });
  },
};

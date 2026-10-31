// data/timeline: a track that draws and nodes that spring on in order with their labels. Variants:
// `roadmap` (dots on a track, labels alternating either side), `milestones` (the date is a pill on
// the track, what happens hangs below), `gantt` (bars that grow from the left, one row each, on a
// time axis) and `stepper` (numbered steps down the frame). The track runs across in a wide frame and
// down in a tall one (`orient`). At p = 1 the slot is the still timeline. Text is DOM; track, bars and
// dots are SVG in the stage's own pixels.
import { LOOK, svgEl, clock, drawn, f2, layer, node, path, place, pop, reveal, span, stage } from '../../../runtime/kit/diagram.js';

const PARAMS = {
  nodes: { type: 'string', default: '', meaning: 'the items, separated by `|`: `when>what` (roadmap, milestones), `name>start-end` in the axis\'s own numbers (gantt), `title>detail` (stepper); at most six (gantt seven)' },
  variant: { type: 'enum(roadmap|milestones|gantt|stepper)', default: 'roadmap', meaning: 'roadmap: dots on a track; milestones: date pills on a track; gantt: bars on a time axis; stepper: numbered steps down the frame' },
  orient: { type: 'enum(auto|h|v)', default: 'auto', meaning: 'roadmap and milestones: the track across (h) or down (v); auto is down in a tall frame' },
  hero: { type: 'number', default: 0, meaning: 'which item (1 = the first) takes the accent plate or a larger dot; 0 for none (gantt: every bar is accent)' },
  unit: { type: 'string', default: '', meaning: 'gantt: what the axis counts ("Week"), at the left of the axis' },
  ...LOOK,
};
const pair = (t) => { const i = t.indexOf('>'); return i < 0 ? [t.trim(), ''] : [t.slice(0, i).trim(), t.slice(i + 1).trim()]; };
const RANGE = /^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|\.\.|to)\s*(-?\d+(?:\.\d+)?)\s*$/;
const T0 = 0.02, T1 = 0.8;   // the track draws over this part of the beat

// a round step for an axis: the smallest of 1, 2, 5, 10, 20, … that gives at most six intervals
function niceStep(range) {
  for (let m = 1; ; m *= 10) for (const k of [1, 2, 5]) if (range / (k * m) <= 6) return k * m;
}

function roadmapOrMilestones(s, ctx, q, list, variant, hero, vertical) {
  const { W, H } = s, N = list.length, lw = s.linePx, svg = layer(s);
  const rd = Math.max(lw * 3, Math.min(W, H) * 0.012), gap = Math.max(lw * 6, 14);
  const pitch = (vertical ? H : W) / N, pos = (i) => (i + 0.5) * pitch;
  const draw = span(q, T0, T1);
  const at = (i) => span(q, T0 + (T1 - T0) * ((i + 0.5) / N) - 0.04, T0 + (T1 - T0) * ((i + 0.5) / N) + 0.16);
  const parts = list.map(pair);
  const mk = (text, opts) => node(s, text, 0, 0, opts);
  // milestones: the date is a pill on the track, so the track's column follows the widest pill
  const pills = variant === 'milestones' ? parts.map(([when], i) => mk(when, { hero: i + 1 === hero, maxW: vertical ? W * 0.3 : pitch * 0.9 })) : [];
  const c0 = vertical ? (pills.length ? Math.max(...pills.map((p) => p.w)) / 2 : rd * 1.4 + lw) : H / 2;
  const trackD = vertical ? `M ${f2(c0)} 0 L ${f2(c0)} ${f2(H)}` : `M 0 ${f2(c0)} L ${f2(W)} ${f2(c0)}`;
  drawn(path(s, svg, trackD), draw);
  const xy = (m, c) => (vertical ? [c, m] : [m, c]);
  // a roadmap running down keeps its dates in one column beside the dots
  const whens = variant === 'roadmap' && vertical ? parts.map(([when, what]) => (what ? mk(when, { bare: true, maxW: W * 0.25 }) : null)) : [];
  const whenW = Math.max(0, ...whens.filter(Boolean).map((n) => n.w));
  parts.forEach(([when, what], i) => {
    const x = at(i), lead = span(x, 0.3, 1);
    if (variant === 'milestones') {
      const pill = pills[i];
      place(pill, ...xy(pos(i), c0));
      reveal(pill, x, ctx);
      if (!what) return;
      const alt = N > 3;   // across, past three milestones the names alternate below and above the track, so each has two pitches of room
      const lab = mk(what, { bare: true, maxW: vertical ? W - Math.max(...pills.map((p) => p.w)) - gap * 2 : pitch * (alt ? 1.84 : 0.92) });
      lab.el.classList.add('mm-tl__what');
      if (vertical) place(lab, Math.max(...pills.map((p) => p.w)) + gap * 2 + lab.w / 2, pos(i));
      else place(lab, pos(i), c0 + (alt && i % 2 ? -1 : 1) * (pill.h / 2 + gap + lab.h / 2));
      reveal(lab, lead, ctx);
      return;
    }
    // roadmap: a dot on the track and its label; in the across form the labels alternate above and below
    const big = i + 1 === hero ? 1.45 : 1, r = rd * big;
    const [cx, cy] = xy(pos(i), c0);
    const dot = svgEl(s.doc, 'circle');
    dot.setAttribute('class', 'mm-tl__dot'); dot.setAttribute('cx', f2(cx)); dot.setAttribute('cy', f2(cy));
    dot.setAttribute('r', f2(r * pop(ctx, x)));
    if (x <= 0) dot.style.visibility = 'hidden';
    svg.append(dot);
    const lx = c0 + rd * 1.45 + gap;
    const w = vertical ? whens[i] : what ? mk(when, { bare: true, maxW: pitch * 1.84 }) : null;
    const t = mk(what || when, { bare: true, maxW: vertical ? W - lx - (whenW ? whenW + gap : 0) : pitch * 1.84 });
    t.el.classList.add('mm-tl__what'); if (i + 1 === hero) t.el.classList.add('mm-tl__what--hero');
    if (w) w.el.classList.add('mm-tl__when');
    const hw = w ? w.h : 0;
    if (vertical) {   // the date in a column of its own, the name on the same line
      if (w) place(w, lx + w.w / 2, cy);
      place(t, lx + (w ? whenW + gap : 0) + t.w / 2, cy);
    } else if (i % 2 === 0) {   // above: the date nearest the track, the name over it
      if (w) place(w, cx, cy - r - gap - hw / 2);
      place(t, cx, cy - r - gap - hw - t.h / 2);
    } else {
      if (w) place(w, cx, cy + r + gap + hw / 2);
      place(t, cx, cy + r + gap + hw + t.h / 2);
    }
    if (w) reveal(w, lead, ctx);
    reveal(t, lead, ctx);
  });
}

function gantt(s, ctx, q, list, hero, unit) {
  const { W } = s, N = list.length, lw = s.linePx;
  let H = s.H;
  const gap = Math.max(lw * 4, 10);
  const rows = list.map((t, i) => { const [name, rg] = pair(t), m = RANGE.exec(rg); return { name, a: m ? Number(m[1]) : i, b: m ? Number(m[2]) : i + 1 }; });
  const t0 = Math.min(...rows.map((r) => r.a)), t1 = Math.max(t0 + 1, ...rows.map((r) => r.b));
  const step = niceStep(t1 - t0);
  const ticks = [];
  for (let v = Math.ceil(t0 / step - 1e-9) * step; v <= t1 + 1e-9 && ticks.length < 8; v += step) ticks.push(Number(v.toFixed(6)));
  const tk = ticks.map((v) => { const nd = node(s, String(v), 0, 0, { bare: true }); nd.el.classList.add('mm-tl__tick'); return nd; });
  // the names are measured first: the name column is as wide as the widest name (at most 40 % of the stage),
  // a row is as tall as its name needs, and the stage grows to hold the rows
  const names = rows.map((r) => node(s, r.name, 0, 0, { bare: true, maxW: W * 0.4 }));
  const axisH = tk[0].h + gap * 2, Lw = Math.max(...names.map((n) => n.w)), X0 = Lw + gap * 2, BW = W - X0 - Math.max(...tk.map((n) => n.w)) / 2;
  const need = Math.max(...names.map((n) => n.h)) + gap;
  if (need * N + axisH > H) { H = need * N + axisH; s.stage.style.height = `${f2(H)}px`; s.H = H; }
  const svg = layer(s);
  const rowH = (H - axisH) / N, barH = Math.min(rowH * 0.52, rowH - gap);
  const X = (v) => X0 + ((v - t0) / (t1 - t0)) * BW;
  const rr = Math.min(parseFloat(getComputedStyle(s.root).getPropertyValue('--dg-radius')) || 0, barH / 2);
  s.root.dataset.hero = String(hero);
  // the axis: a baseline, a tick and a number at each step, the unit at the left
  const ay = H - axisH + gap, axis = span(q, 0, 0.15);
  drawn(path(s, svg, `M ${f2(X0)} ${f2(ay)} L ${f2(W)} ${f2(ay)}`), ctx.ease('move', axis));
  tk.forEach((nd, i) => {
    place(nd, X(ticks[i]), ay + gap + nd.h / 2);
    reveal(nd, axis, ctx);
    drawn(path(s, svg, `M ${f2(X(ticks[i]))} ${f2(ay)} L ${f2(X(ticks[i]))} ${f2(ay + gap * 0.6)}`), axis);
  });
  const u = String(unit ?? '').trim();
  if (u) {
    const nd = node(s, u, 0, 0, { bare: true, maxW: Lw });
    nd.el.classList.add('mm-tl__tick');
    place(nd, nd.w / 2, ay + gap + nd.h / 2);
    reveal(nd, axis, ctx);
  }
  rows.forEach((r, i) => {
    const cy = (i + 0.5) * rowH, x = span(q, 0.12 + i * (0.55 / N), 0.12 + i * (0.55 / N) + 0.3);
    const name = names[i];
    place(name, name.w / 2, cy);
    reveal(name, span(x, 0, 0.5), ctx);
    const bar = svgEl(s.doc, 'rect');
    bar.setAttribute('class', `mm-tl__bar${i + 1 === hero ? ' mm-tl__bar--hero' : ''}`);
    for (const [k, v] of [['x', X(r.a)], ['y', cy - barH / 2], ['width', Math.max(X(r.b) - X(r.a), barH * 0.5)], ['height', barH], ['rx', rr]]) bar.setAttribute(k, f2(v));
    if (x <= 0) bar.style.visibility = 'hidden';
    else if (x < 1) bar.style.scale = `${f2(ctx.ease('move', x))} 1`;
    svg.append(bar);
  });
}

function stepper(s, ctx, q, list, hero) {
  const { W, H } = s, N = list.length, lw = s.linePx, svg = layer(s);
  const gap = Math.max(lw * 4, 10), pitch = H / N;
  const nums = list.map((_, i) => node(s, String(i + 1), 0, 0, { hero: i + 1 === hero || !hero, square: true }));
  const nw = Math.max(...nums.map((n) => n.w)), lx = nw + gap * 2;
  list.forEach((t, i) => {
    const [title, detail] = pair(t), cy = (i + 0.5) * pitch, start = 0.02 + i * (0.7 / N);
    place(nums[i], nw / 2, cy);
    reveal(nums[i], span(q, start, start + 0.2), ctx);
    const a = node(s, title, 0, 0, { bare: true, maxW: W - lx });
    a.el.classList.add('mm-tl__what');
    const b = detail ? node(s, detail, 0, 0, { bare: true, maxW: W - lx }) : null;
    if (b) b.el.classList.add('mm-tl__when');
    const block = a.h + (b ? b.h : 0);
    place(a, lx + a.w / 2, cy - block / 2 + a.h / 2);
    if (b) place(b, lx + b.w / 2, cy + block / 2 - b.h / 2);
    reveal(a, span(q, start + 0.08, start + 0.28), ctx);
    if (b) reveal(b, span(q, start + 0.08, start + 0.28), ctx);
    if (i + 1 < N) {   // the line down to the next number
      const y0 = cy + nums[i].h / 2 + gap * 0.5, y1 = (i + 1.5) * pitch - nums[i + 1].h / 2 - gap * 0.5;
      drawn(path(s, svg, `M ${f2(nw / 2)} ${f2(y0)} L ${f2(nw / 2)} ${f2(y1)}`), span(q, start + 0.12, start + 0.7 / N + 0.05));
    }
  });
}

export default {
  name: 'timeline',
  group: 'data',
  dur: 'hold',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = ctx.params ?? {};
    const variant = ['roadmap', 'milestones', 'gantt', 'stepper'].includes(prm.variant) ? prm.variant : 'roadmap';
    const list = String(prm.nodes ?? '').split(/\||\n/).map((t) => t.trim()).filter(Boolean).slice(0, variant === 'gantt' ? 7 : 6);
    const s = stage(el, 'tl', prm);
    if (!list.length) { el.replaceChildren(); return; }
    const vertical = prm.orient === 'v' || (prm.orient !== 'h' && s.portrait);
    s.root.dataset.variant = variant;
    s.root.dataset.orient = variant === 'roadmap' || variant === 'milestones' ? (vertical ? 'v' : 'h') : 'v';
    s.root.dataset.align = s.root.dataset.orient === 'v' ? 'left' : 'center';
    s.root.dataset.dense = list.length > 4 ? '1' : '0';
    const q = clock(p, ctx), hero = Math.round(Number(prm.hero) || 0);
    if (variant === 'gantt') gantt(s, ctx, q, list, hero, prm.unit);
    else if (variant === 'stepper') stepper(s, ctx, q, list, hero);
    else roadmapOrMilestones(s, ctx, q, list, variant, hero, vertical);
  },
};

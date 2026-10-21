// data/flow: one node fans out to several and they gather into one, on curves. The nodes appear,
// the curves draw, then a pulse travels from the source along each curve to a middle node, which
// rings as it lands; pulses go on from every middle node to the sink, which rings last. At p = 1
// the slot is the still diagram: nodes and drawn curves, no pulses, no rings. Nodes are DOM text
// (every legibility check reads them); curves and pulses are SVG in the slot's own pixels.
const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const f2 = (x) => x.toFixed(2);
const SHOW = [0, 0.25], DRAW = [0.1, 0.45], HOP1 = [0.45, 0.7], HOP2 = [0.72, 0.95], RING = 0.12;

const params = {
  nodes: { type: 'string', default: '', meaning: 'source|middle,middle,…|sink: one source, two to four middle nodes, one sink' },
};

export default {
  name: 'flow',
  group: 'data',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const doc = el.ownerDocument;
    const [src, mids, sink] = String(ctx.params?.nodes ?? '').split('|').map((s) => s.trim());
    const middle = String(mids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    el.replaceChildren();
    if (!src || !sink || !middle.length) return;
    const q = p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const root = doc.createElement('div');   // the class lives on a wrapper rebuilt each frame (the kit restores a slot's html, not its classes)
    root.className = 'mm-flow';
    const stage = doc.createElement('div');
    stage.className = 'mm-flow__stage';
    root.append(stage);
    el.append(root);
    const W = stage.offsetWidth, H = stage.offsetHeight;
    const show = ctx.ease('enter', clamp01((q - SHOW[0]) / (SHOW[1] - SHOW[0])));
    // place a node centred on (cx, cy), measured so the curves meet its edges
    const node = (text, cx, cy, i) => {
      const n = doc.createElement('div');
      n.className = `mm-flow__node${i === 'end' ? ' mm-flow__node--sink' : ''}`;
      n.textContent = text;
      stage.append(n);
      const w = n.offsetWidth, h = n.offsetHeight;
      n.style.left = `${f2(cx - w / 2)}px`;
      n.style.top = `${f2(cy - h / 2)}px`;
      if (show < 1) n.style.opacity = f2(show);
      return { el: n, l: cx - w / 2, r: cx + w / 2, cy, box: [cx - w / 2, cy - h / 2, w, h] };
    };
    const a = node(src, W / 6, H / 2, 0);
    const ms = middle.map((t, i) => node(t, W / 2, (H * (i + 0.5)) / middle.length, i + 1));
    const z = node(sink, (W * 5) / 6, H / 2, 'end');
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mm-flow__wires');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
    svg.setAttribute('aria-hidden', 'true');
    stage.prepend(svg);
    const curve = (x1, y1, x2, y2) => { const k = (x2 - x1) * 0.5; return `M ${f2(x1)} ${f2(y1)} C ${f2(x1 + k)} ${f2(y1)} ${f2(x2 - k)} ${f2(y2)} ${f2(x2)} ${f2(y2)}`; };
    const draw = ctx.ease('move', clamp01((q - DRAW[0]) / (DRAW[1] - DRAW[0])));
    const edge = (d) => { const e = doc.createElementNS(NS, 'path'); e.setAttribute('class', 'mm-flow__edge'); e.setAttribute('d', d); e.setAttribute('pathLength', '1'); e.style.strokeDasharray = '1 1'; e.style.strokeDashoffset = f2(1 - draw); svg.append(e); return e; };
    const ins = ms.map((m) => edge(curve(a.r, a.cy, m.l, m.cy)));
    const outs = ms.map((m) => edge(curve(m.r, m.cy, z.l, z.cy)));
    const pulse = (path, u) => { if (u <= 0 || u >= 1) return; const L = path.getTotalLength(), pt = path.getPointAtLength(L * ctx.ease('move', u));
      const c = doc.createElementNS(NS, 'circle'); c.setAttribute('class', 'mm-flow__pulse'); c.setAttribute('cx', f2(pt.x)); c.setAttribute('cy', f2(pt.y)); c.setAttribute('r', f2(Math.max(4, H * 0.018))); svg.append(c); };
    const ring = (n, since) => { if (since < 0 || since >= RING) return; const r = doc.createElement('span'); r.className = 'mm-flow__ring'; r.setAttribute('aria-hidden', 'true');
      const s = since / RING; const [x, y, w, h] = n.box; r.style.cssText = `left:${f2(x)}px;top:${f2(y)}px;width:${f2(w)}px;height:${f2(h)}px;scale:${f2(1 + 0.35 * s)};opacity:${f2(1 - s)}`; stage.append(r); };
    const h1 = (q - HOP1[0]) / (HOP1[1] - HOP1[0]), h2 = (q - HOP2[0]) / (HOP2[1] - HOP2[0]);
    ins.forEach((e) => pulse(e, h1));
    outs.forEach((e) => pulse(e, h2));
    if (q < 1) { ms.forEach((m) => ring(m, q - HOP1[1])); ring(z, q - HOP2[1]); }
  },
};

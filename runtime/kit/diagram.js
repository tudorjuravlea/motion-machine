// What the structure-diagram patterns (data/org-chart, cycle, venn, pyramid, matrix, timeline)
// share: the text grammar, the brand knobs, nodes measured from their text, drawn edges and a pure
// push-apart. Nothing here keeps time: every function is a closed form of the progress it is given.
// The grammar extends data/flow's (`source|a,b,c|sink`): `|` separates items, `,` lists siblings,
// `>` goes deeper (a tree's depth, an item's detail), a newline is `|`.
/** An SVG element made by the HTML parser, so the kit needs no namespace string (runtime/ carries no URL, SPEC 2.6). */
export function svgEl(doc, tag) {
  const t = doc.createElement('template');
  t.innerHTML = tag === 'svg' ? '<svg></svg>' : `<svg><${tag}></${tag}></svg>`;
  return tag === 'svg' ? t.content.firstChild : t.content.firstChild.firstChild;
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const f2 = (x) => x.toFixed(2);
/** Where q sits in the range a..b, 0 to 1. */
export const span = (q, a, b) => clamp01((q - a) / (b - a));

/** The beat's own progress: p = 1 is exactly 1; otherwise its seconds over its length, so a pattern can run its own phases. */
export function clock(p, ctx) {
  return p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
}

/** The items of a list: split on `|`, `>`, `,` and newlines, trimmed. */
export function items(text) {
  return String(text ?? '').split(/[|>,\n]/).map((s) => s.trim()).filter(Boolean);
}

const MAX_NODES = 16;
/**
 * A tree from text. A `|` (or a newline) separates groups; a group's leading `>`s, or its
 * indentation (two spaces a level), give its depth; a `,` lists siblings at that depth. A node
 * belongs to the last node one level up and a level is never skipped, so `CEO|>Product|>>Design|>Sales`
 * is a root with two children, the first with one of its own. A second root becomes a child of the
 * first. At most 16 nodes. Returns the nodes in reading order: `{ text, depth, parent, children, i }`.
 */
export function parseTree(text) {
  const out = [], last = [];
  for (const raw of String(text ?? '').split(/\||\n/)) {
    const m = /^(\s*)((?:>\s*)*)(.*)$/.exec(raw);
    let depth = m[2] ? m[2].match(/>/g).length : Math.floor(m[1].replace(/\t/g, '  ').length / 2);
    if (depth === 0 && out.length) depth = 1;
    for (const t of m[3].split(',').map((s) => s.trim()).filter(Boolean)) {
      if (out.length >= MAX_NODES) return out;
      const d = Math.min(depth, last.length);
      const node = { text: t, depth: d, parent: d ? last[d - 1] : null, children: [], i: out.length };
      node.parent?.children.push(node);
      last[d] = node;
      last.length = d + 1;
      out.push(node);
    }
  }
  return out;
}

/**
 * Pushes overlapping boxes apart (centre x, y, size w, h; `fixed` ones stay) with `pad` between,
 * keeping every box inside `{ w, h }`. Pure and in a fixed order, so a frame is the same every time.
 */
export function separate(boxes, bounds, pad = 0) {
  const b = boxes.map((o) => ({ ...o }));
  const keep = (o) => {
    if (o.fixed) return;
    o.x = Math.min(bounds.w - o.w / 2, Math.max(o.w / 2, o.x));
    o.y = Math.min(bounds.h - o.h / 2, Math.max(o.h / 2, o.y));
  };
  b.forEach(keep);
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        const a = b[i], c = b[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const ox = (a.w + c.w) / 2 + pad - Math.abs(dx), oy = (a.h + c.h) / 2 + pad - Math.abs(dy);
        if (ox <= 0.01 || oy <= 0.01) continue;
        moved = true;
        const share = a.fixed || c.fixed ? 1 : 0.5;
        const [mx, my] = ox < oy ? [(dx < 0 ? -ox : ox), 0] : [0, (dy < 0 ? -oy : oy)];
        if (!c.fixed) { c.x += mx * share; c.y += my * share; }
        if (!a.fixed) { a.x -= mx * share; a.y -= my * share; }
        keep(a); keep(c);
      }
    }
    if (!moved) break;
  }
  return b;
}

const SHAPE_RADIUS = { disc: 4, rounded: 2, square: 0 };
const ACCENT_INK = { accent: 'accentInk', ink: 'canvas', muted: 'canvas' };
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** The brand knobs every diagram has, as pattern params (spread into the pattern's own). */
export const LOOK = {
  shape: { type: 'enum(disc|rounded|square)', default: 'rounded', meaning: 'the node shape, through the radius scale: disc (the pill radius, a circle for a short label), rounded, square' },
  line: { type: 'number', default: 0.004, meaning: 'stroke weight as a share of the frame\'s short side (0.001 to 0.02): hairline to bold' },
  accent: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role that carries the accent (hero nodes, drawn marks)' },
  edge: { type: 'enum(line|muted|ink)', default: 'muted', meaning: 'the palette role of the connecting lines' },
  face: { type: 'enum(text|mono|display)', default: 'text', meaning: 'the label face' },
};

/** The CSS variables a diagram's root carries for its brand knobs; palette roles only. */
export function lookVars(prm) {
  const accent = pick(prm.accent, ['accent', 'ink', 'muted'], 'accent');
  const face = pick(prm.face, ['text', 'mono', 'display'], 'text');
  const line = Math.min(0.02, Math.max(0.001, Number.isFinite(Number(prm.line)) && prm.line !== '' ? Number(prm.line) : LOOK.line.default));
  return {
    '--dg-radius': `var(--mm-radius-${SHAPE_RADIUS[pick(prm.shape, Object.keys(SHAPE_RADIUS), 'rounded')]})`,
    '--dg-accent': `var(--mm-color-${accent})`,
    '--dg-accent-ink': `var(--mm-color-${ACCENT_INK[accent]})`,
    '--dg-edge': `var(--mm-color-${pick(prm.edge, ['line', 'muted', 'ink'], 'muted')})`,
    '--dg-face': `var(--mm-font-${face})`,
    '--dg-weight': `var(--mm-weight-${face})`,
    '--dg-tracking': `var(--mm-tracking-${face})`,
    '--dg-line': String(line),
  };
}

/** The root and the stage of a diagram in the slot `el`, rebuilt every frame (the kit restores a slot's html, not its classes). */
export function stage(el, name, prm) {
  const doc = el.ownerDocument;
  const root = doc.createElement('div');
  root.className = `mm-dg mm-${name}`;
  for (const [k, v] of Object.entries(lookVars(prm))) root.style.setProperty(k, v);
  root.dataset.shape = pick(prm.shape, Object.keys(SHAPE_RADIUS), 'rounded');
  const st = doc.createElement('div');
  st.className = 'mm-dg__stage';
  root.append(st);
  el.replaceChildren(root);
  const fr = doc.documentElement, cs = doc.defaultView.getComputedStyle(fr);
  const fw = parseFloat(cs.getPropertyValue('--mm-frame-w')) || 1080, fh = parseFloat(cs.getPropertyValue('--mm-frame-h')) || 1080;
  return { root, stage: st, W: st.offsetWidth, H: st.offsetHeight, doc, linePx: Math.min(fw, fh) * Number(lookVars(prm)['--dg-line']), portrait: fh > fw * 1.1 };
}

/** A node of real text centred on (cx, cy): a plate behind a label, measured so edges meet its sides. `maxW` wraps the label; `hero` takes the accent plate, `soft` a faint ink one, `bare` none; `square` makes it at least as wide as tall (a short label in a disc shape is a circle). */
export function node(s, text, cx, cy, { hero = false, maxW = 0, soft = false, bare = false, square = false } = {}) {
  const n = s.doc.createElement('div');
  n.className = `mm-dg__node${hero ? ' mm-dg__node--hero' : ''}${soft ? ' mm-dg__node--soft' : ''}${bare ? ' mm-dg__node--bare' : ''}`;
  const plate = s.doc.createElement('span'), label = s.doc.createElement('span');
  plate.className = 'mm-dg__plate'; label.className = 'mm-dg__label';
  label.textContent = text;
  if (maxW > 0) label.style.maxWidth = `${f2(maxW)}px`;
  n.append(plate, label);
  s.stage.append(n);
  const h = n.offsetHeight;
  if ((square || s.root.dataset.shape === 'disc') && n.offsetWidth < h) n.style.minWidth = `${f2(h)}px`;
  const w = n.offsetWidth;
  n.style.left = `${f2(cx - w / 2)}px`;
  n.style.top = `${f2(cy - h / 2)}px`;
  return { el: n, plate, label, cx, cy, w, h, l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
}

/** Moves a node made by `node` so its centre is (cx, cy). */
export function place(nd, cx, cy) {
  Object.assign(nd, { cx, cy, l: cx - nd.w / 2, r: cx + nd.w / 2, t: cy - nd.h / 2, b: cy + nd.h / 2 });
  nd.el.style.left = `${f2(nd.l)}px`;
  nd.el.style.top = `${f2(nd.t)}px`;
  return nd;
}

/** The style's `ui` spring over x in 0..1: 0 before, exactly 1 after, a small overshoot between. Shapes use it; text never does. */
export const pop = (ctx, x) => (x <= 0 ? 0 : x >= 1 ? 1 : ctx.spring(x * ctx.spring.settle('ui'), 'ui'));

/** A node arriving at x (0..1): its plate springs up from 0.55, its label eases in with no fill of its own; at x = 1 it is untouched. */
export function reveal(nd, x, ctx) {
  nd.el.style.visibility = x <= 0 ? 'hidden' : '';
  if (x <= 0 || x >= 1) return;
  nd.label.style.background = 'transparent';   // the label's own fill (diagram.css) waits for the rest; the plate springs alone
  nd.plate.style.scale = f2(0.55 + 0.45 * pop(ctx, x));
  nd.plate.style.opacity = f2(clamp01(x * 4));
  nd.label.style.opacity = f2(ctx.ease('enter', x));
}

/** The SVG layer under a diagram's nodes, in the stage's own pixels. */
export function layer(s) {
  const svg = svgEl(s.doc, 'svg');
  svg.setAttribute('class', 'mm-dg__wires');
  svg.setAttribute('viewBox', `0 0 ${s.W} ${s.H}`);
  svg.setAttribute('width', String(s.W)); svg.setAttribute('height', String(s.H));
  svg.setAttribute('aria-hidden', 'true');
  s.stage.prepend(svg);
  return svg;
}

/** A path drawable by dash offset; `mod` adds a class (`accent`, `fill`, `dash`). */
export function path(s, svg, d, mod = '') {
  const e = svgEl(s.doc, 'path');
  e.setAttribute('class', `mm-dg__edge${mod ? ` mm-dg__edge--${mod}` : ''}`);
  e.setAttribute('d', d);
  e.setAttribute('pathLength', '1');
  svg.append(e);
  return e;
}

/** Draws a path u of the way (0..1): nothing at 0, the whole stroke, with no dash left over, at 1. */
export function drawn(e, u) {
  e.style.visibility = u <= 0 ? 'hidden' : '';
  if (u >= 1) return;
  e.style.strokeDasharray = '1 1';
  e.style.strokeDashoffset = f2(1 - clamp01(u));
}

/** An arrow head (a small filled triangle) with its tip at (x, y) pointing along angle `a` radians. */
export function head(s, svg, x, y, a, size) {
  const e = svgEl(s.doc, 'path');
  const p = (k, sd) => `${f2(x - Math.cos(a) * k - Math.sin(a) * sd)} ${f2(y - Math.sin(a) * k + Math.cos(a) * sd)}`;
  e.setAttribute('class', 'mm-dg__head');
  e.setAttribute('d', `M ${f2(x)} ${f2(y)} L ${p(size, size * 0.55)} L ${p(size, -size * 0.55)} Z`);
  svg.append(e);
  return e;
}

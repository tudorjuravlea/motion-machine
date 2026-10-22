// Reads an SVG drawn in any vector tool into named layers of plain geometry, for the mascot
// importer. No DOM and no network: a small tag reader builds the element tree; transforms are
// folded into the coordinates; rect, circle, ellipse, line, polyline, polygon and path become one
// path form (absolute M, L, C, Z); fills and strokes resolve through presentation attributes, the
// simple class rules a <style> block holds (the form vector tools export), and inline styles.
// A layer's name is its Inkscape label, its data-name (layer names with spaces), or its id, in
// lower case with spaces and underscores as hyphens; ids a tool generates (path123, Ellipse 2) do
// not name anything. Scripts, foreign objects, entity declarations and external references are
// refused; pictures and text are skipped with a note.

const AUTO = /^(?:path|rect|circle|ellipse|g|group|layer|polygon|polyline|line|svg|defs|use|text|tspan|image|stop|vector|frame|union|subtract|intersect|exclude|star|shape|clip-?path|mask|lineargradient|radialgradient|object|artboard)(?:[-_ ]?\d+)*$/i;
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SKIP = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter', 'metadata', 'title', 'desc', 'style', 'sodipodi:namedview']);

const fail = (message) => Object.assign(new Error(message), { exitCode: 1 });

// ---------------------------------------------------------------- the tag reader

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/** The element tree of an SVG document: { tag, attrs, children, text }. Throws on what it refuses. */
export function parseXml(text) {
  const src = String(text);
  if (/<!ENTITY/i.test(src)) throw fail('the SVG declares entities; export it again without a DOCTYPE');
  const body = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([A-Za-z][\w:.-]*)\s*>|<([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) { if (stack.length > 1 && top.tag === m[2]) stack.pop(); }
    else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const el = { tag: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += m[6];
  }
  const svg = root.children.find((c) => c.tag === 'svg');
  if (!svg) throw fail('no <svg> element in the file');
  return svg;
}

// ---------------------------------------------------------------- transforms

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
export const IDENTITY = [1, 0, 0, 1, 0, 0];
export const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

/** A transform attribute as a matrix [a b c d e f]. */
export function parseTransform(s) {
  let M = IDENTITY;
  for (const t of String(s ?? '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = (t[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    let T = IDENTITY;
    if (t[1] === 'matrix' && n.length >= 6) T = n.slice(0, 6);
    else if (t[1] === 'translate') T = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (t[1] === 'scale') T = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (t[1] === 'rotate') {
      const r = ((n[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s2 = Math.sin(r), [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      T = mul(mul([1, 0, 0, 1, cx, cy], [c, s2, -s2, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (t[1] === 'skewX') T = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (t[1] === 'skewY') T = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    M = mul(M, T);
  }
  return M;
}

// ---------------------------------------------------------------- paths

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

// an arc from (x1, y1) as cubic segments of at most a quarter turn each
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const L = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n, kk = (4 / 3) * Math.tan(step / 4);
  const pt = (th) => [cx + rx * Math.cos(th) * c - ry * Math.sin(th) * s, cy + rx * Math.cos(th) * s + ry * Math.sin(th) * c];
  const dpt = (th) => [-rx * Math.sin(th) * c - ry * Math.cos(th) * s, -rx * Math.sin(th) * s + ry * Math.cos(th) * c];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step, [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dpt(a), [dbx, dby] = dpt(b);
    out.push([ax + kk * dax, ay + kk * day, bx - kk * dbx, by - kk * dby, bx, by]);
  }
  return out;
}

/** Path data as absolute segments of four kinds: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']. */
export function normalisePath(d) {
  const tok = String(d).match(/[A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const out = [];
  let i = 0, cmd = null, x = 0, y = 0, x0 = 0, y0 = 0, lc = null, lq = null;
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    else if (!cmd) break;
    const C = cmd.toUpperCase(), rel = cmd !== C, n = ARITY[C];
    if (n === undefined) throw fail(`path command "${cmd}" is not SVG path data`);
    if (C === 'Z') { out.push(['Z']); x = x0; y = y0; lc = lq = null; continue; }
    const a = tok.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => !Number.isFinite(v))) break;
    i += n;
    const X = (v) => (rel ? x + v : v), Y = (v) => (rel ? y + v : v);
    let nlc = null, nlq = null;
    if (C === 'M') { x = x0 = X(a[0]); y = y0 = Y(a[1]); out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L' || C === 'H' || C === 'V') {
      const nx = C === 'V' ? x : X(a[0]), ny = C === 'H' ? y : C === 'V' ? Y(a[0]) : Y(a[1]);
      out.push(['L', nx, ny]); x = nx; y = ny;
    } else if (C === 'C' || C === 'S') {
      const [c1x, c1y] = C === 'C' ? [X(a[0]), Y(a[1])] : lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
      const o = C === 'C' ? 2 : 0;
      const c2x = X(a[o]), c2y = Y(a[o + 1]), ex = X(a[o + 2]), ey = Y(a[o + 3]);
      out.push(['C', c1x, c1y, c2x, c2y, ex, ey]); nlc = [c2x, c2y]; x = ex; y = ey;
    } else if (C === 'Q' || C === 'T') {
      const [qx, qy] = C === 'Q' ? [X(a[0]), Y(a[1])] : lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
      const ex = C === 'Q' ? X(a[2]) : X(a[0]), ey = C === 'Q' ? Y(a[3]) : Y(a[1]);
      out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      nlq = [qx, qy]; x = ex; y = ey;
    } else if (C === 'A') {
      const ex = X(a[5]), ey = Y(a[6]);
      for (const c of arcToCubics(x, y, a[0], a[1], a[2], a[3] ? 1 : 0, a[4] ? 1 : 0, ex, ey)) out.push(['C', ...c]);
      x = ex; y = ey;
    }
    lc = nlc; lq = nlq;
  }
  return out;
}

/** Segments moved by a matrix (every kind stays exact under an affine map). */
export const transformSegs = (segs, M) => segs.map(([C, ...a]) => {
  const o = [C];
  for (let k = 0; k < a.length; k += 2) o.push(...apply(M, a[k], a[k + 1]));
  return o;
});

/** Points along the segments (curves sampled), for boxes, anchors and inside tests: one array per subpath. */
export function flatten(segs, steps = 12) {
  const subs = [];
  let cur = null, x = 0, y = 0;
  for (const [C, ...a] of segs) {
    if (C === 'M') { cur = [[a[0], a[1]]]; subs.push(cur); [x, y] = a; continue; }
    if (!cur) { cur = [[x, y]]; subs.push(cur); }
    if (C === 'Z') { if (cur.length) [x, y] = cur[0]; continue; }
    if (C === 'L') { cur.push([a[0], a[1]]); [x, y] = a; continue; }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      cur.push([u * u * u * x + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t * t * t * a[4], u * u * u * y + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t * t * t * a[5]]);
    }
    [x, y] = [a[4], a[5]];
  }
  return subs;
}

/** The box of point lists: { x0, y0, x1, y1 } or null. */
export function boxOf(subs) {
  let b = null;
  for (const s of subs) for (const [x, y] of s) b = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  return b;
}

const f = (v) => { const r = Math.round(v * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };
/** Segments as path data with numbers to three decimals. */
export const pathText = (segs) => segs.map(([C, ...a]) => C + a.map(f).join(' ')).join(' ');

// ---------------------------------------------------------------- shapes

const N = (v, d = 0) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : d; };
const ellipse = (cx, cy, rx, ry) => `M${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx} ${cy - ry} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy} Z`;

/** A shape element's path data in its own coordinates, and for a rect its corner radius; null for no geometry. */
export function shapePath(el) {
  const a = el.attrs;
  switch (el.tag) {
    case 'path': return a.d ? { d: a.d } : null;
    case 'rect': {
      const x = N(a.x), y = N(a.y), w = N(a.width), h = N(a.height);
      if (!(w > 0 && h > 0)) return null;
      let rx = a.rx !== undefined ? N(a.rx) : a.ry !== undefined ? N(a.ry) : 0, ry = a.ry !== undefined ? N(a.ry) : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      const d = rx > 0 && ry > 0
        ? `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`
        : `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
      return { d, rect: { x, y, w, h, r: Math.min(rx, ry) } };
    }
    case 'circle': { const r = N(a.r); return r > 0 ? { d: ellipse(N(a.cx), N(a.cy), r, r) } : null; }
    case 'ellipse': { const rx = N(a.rx), ry = N(a.ry); return rx > 0 && ry > 0 ? { d: ellipse(N(a.cx), N(a.cy), rx, ry) } : null; }
    case 'line': return { d: `M${N(a.x1)} ${N(a.y1)} L${N(a.x2)} ${N(a.y2)}` };
    case 'polyline': case 'polygon': {
      const n = (a.points ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? [];
      if (n.length < 4) return null;
      let d = `M${n[0]} ${n[1]}`;
      for (let i = 2; i + 1 < n.length; i += 2) d += ` L${n[i]} ${n[i + 1]}`;
      return { d: el.tag === 'polygon' ? `${d} Z` : d };
    }
    default: return null;
  }
}

// ---------------------------------------------------------------- styles

const INHERITED = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'visibility', 'fill-rule'];
const STYLE_KEYS = [...INHERITED, 'display', 'opacity'];

const declarations = (text) => Object.fromEntries(String(text ?? '').split(';').map((p) => p.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()]));

/** Simple class rules from <style> blocks: `.a, .b { fill: … }` (other selectors are ignored with a note). */
function classRules(svg, notes) {
  const rules = {};
  const walk = (el) => {
    if (el.tag === 'style') {
      const css = el.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const r of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const decl = declarations(r[2]);
        for (const sel of r[1].split(',').map((x) => x.trim()).filter(Boolean)) {
          if (/^\.[\w-]+$/.test(sel)) rules[sel.slice(1)] = { ...(rules[sel.slice(1)] ?? {}), ...decl };
          else notes.push(`style rule "${sel}" is not a plain class and is ignored`);
        }
      }
    }
    el.children.forEach(walk);
  };
  walk(svg);
  return rules;
}

function ownStyle(el, rules) {
  const s = {};
  for (const k of STYLE_KEYS) if (el.attrs[k] !== undefined) s[k] = el.attrs[k];
  for (const c of String(el.attrs.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(s, rules[c] ?? {});
  Object.assign(s, declarations(el.attrs.style));
  return s;
}

// ---------------------------------------------------------------- layers

/** A layer name as the importer reads it, or null for an id a tool generated. */
export function nameOf(el) {
  const raw = el.attrs['inkscape:label'] ?? el.attrs['data-name'] ?? el.attrs.id;
  if (!raw) return null;
  const n = String(raw).trim().replace(/_x([0-9a-f]{2})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return n && !AUTO.test(n) ? n : null;
}

/**
 * The SVG as a list of shapes in document order, each with its geometry in the document's
 * coordinates, its resolved style and the chain of layer names above it (nearest last):
 * { segs, subs, box, rect, style, names, order, anchor, swing }. Also `notes` (what was skipped)
 * and `gradients` (id → stop colours, for a fill that names one).
 */
export function readSvg(text) {
  const svg = parseXml(text);
  const notes = [];
  const rules = classRules(svg, notes);
  const gradients = {};
  const shapes = [];
  const walk = (el, M, style, names, data) => {
    if (el.tag === 'script' || el.tag === 'foreignObject') throw fail(`the SVG holds a <${el.tag}>; export the drawing without it`);
    if (/Gradient$/.test(el.tag) && el.attrs.id) gradients[el.attrs.id] = el.children.filter((c) => c.tag === 'stop').map((c) => ({ ...ownStyle(c, rules), ...c.attrs })['stop-color']).filter(Boolean);
    const href = el.attrs.href ?? el.attrs['xlink:href'];
    if (href && !href.startsWith('#')) throw fail(`the SVG refers to an outside file (${href}); embed or remove it`);
    if (SKIP.has(el.tag)) { el.children.forEach((c) => walk(c, M, style, names, data)); return; }
    const own = ownStyle(el, rules);
    if (own.display === 'none' || own.visibility === 'hidden') return;
    const inherit = Object.fromEntries(INHERITED.filter((k) => style[k] !== undefined).map((k) => [k, style[k]]));
    const st = { ...inherit, ...own, opacity: String(N(style.opacity, 1) * N(own.opacity, 1)) };
    const T = el.tag === 'svg' ? M : mul(M, parseTransform(el.attrs.transform));
    const name = el.tag === 'svg' ? null : nameOf(el);
    const chain = name ? [...names, name] : names;
    const d2 = { ...data };
    if (el.attrs['data-anchor']) d2.anchor = { at: (el.attrs['data-anchor'].match(/[+-]?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number), M: T, name };
    if (el.attrs['data-swing'] !== undefined) d2.swing = { v: N(el.attrs['data-swing'], 0.5), name };
    if (el.tag === 'image' || el.tag === 'text' || el.tag === 'use') { notes.push(`a <${el.tag}>${name ? ` (${name})` : ''} is skipped: the rig draws vector shapes only`); return; }
    if (SHAPES.has(el.tag)) {
      const sp = shapePath(el);
      if (!sp) return;
      const segs = transformSegs(normalisePath(sp.d), T), subs = flatten(segs);
      const scale = Math.sqrt(Math.abs(T[0] * T[3] - T[1] * T[2])) || 1;
      let rect = null;
      if (sp.rect && Math.abs(T[1]) < 1e-9 && Math.abs(T[2]) < 1e-9) {
        const [x0, y0] = apply(T, sp.rect.x, sp.rect.y), [x1, y1] = apply(T, sp.rect.x + sp.rect.w, sp.rect.y + sp.rect.h);
        rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), r: sp.rect.r * Math.min(Math.abs(T[0]), Math.abs(T[3])) };
      }
      const anchor = d2.anchor && d2.anchor.at.length >= 2 ? apply(d2.anchor.M, d2.anchor.at[0], d2.anchor.at[1]) : null;
      shapes.push({ tag: el.tag, segs, subs, box: boxOf(subs), rect, style: st, scale, names: chain, order: shapes.length, anchor, anchorOf: d2.anchor?.name ?? null, swing: d2.swing ?? null });
      return;
    }
    el.children.forEach((c) => walk(c, T, st, chain, d2));
  };
  walk(svg, IDENTITY, {}, [], {});
  return { shapes, notes, gradients };
}

// ---------------------------------------------------------------- colours

const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', navy: '#000080', teal: '#008080', silver: '#c0c0c0', maroon: '#800000' };

/** A paint value as [r, g, b] (0 to 255), null for none, or { gradient: id }. */
export function parsePaint(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return null;
  const url = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(s);
  if (url) return { gradient: url[1] };
  const hex = NAMED[s] ?? s;
  let m = /^#([0-9a-f]{3,4})$/.exec(hex);
  if (m) return [...m[1].slice(0, 3)].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(hex);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => (x.endsWith('%') ? (2.55 * parseFloat(x)) : parseFloat(x)));
  return undefined;   // a colour the importer cannot read
}

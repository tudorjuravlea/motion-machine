// transitions/brush-wipe: fat painted bands, tilted a few degrees, sweep across until they cover
// the whole frame, the scenes swap under that cover, and the bands drag off the far side. Each
// band starts a little after its neighbour, its two ends are ragged like a dry brush, its top and
// bottom edges wave, and a lighter streak runs along it. The bands alternate a palette role and a
// blend of that role with another, so every colour is the brand's.
//
// Before the middle of the cut only the outgoing scene is drawn (the bands on it); from the middle
// only the incoming one. The drawing is an inline SVG marked data-mm-overlay inside the drawn
// section, so the kit removes it on every seek. The geometry is a closed form of the cut's linear
// time and the frame size; the raggedness comes from an integer hash, never from a random source.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);
const r1 = (x) => String(Math.round(x * 10) / 10);
const round = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
const OWN = ['opacity', 'visibility'];
const SVG = 'http://www.w3.org/2000/svg';
const STAGGER = 0.18;   // the latest band starts this share of a half later than the first
const ENDS = 9;         // points along each ragged end
const EDGE = 12;        // points along each wavy edge

const params = {
  pair: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the role the bands are painted in; every other band blends it with a second role' },
  bands: { type: 'number', default: 5, meaning: 'how many bands, 3 to 8' },
  tilt: { type: 'number', default: -6, meaning: 'the bands’ angle in degrees, -20 to 20' },
  side: { type: 'enum(left|right)', default: 'left', meaning: 'the frame edge the bands sweep in from' },
};

// band, alternate band, streak: a role, then blends of it with a second role
const PAIRS = {
  accent: ['var(--mm-color-accent)', 'color-mix(in srgb, var(--mm-color-accent) 62%, var(--mm-color-ink))', 'color-mix(in srgb, var(--mm-color-accent) 70%, var(--mm-color-canvas))'],
  ink: ['var(--mm-color-ink)', 'color-mix(in srgb, var(--mm-color-ink) 72%, var(--mm-color-canvas))', 'color-mix(in srgb, var(--mm-color-ink) 80%, var(--mm-color-accent))'],
  muted: ['var(--mm-color-muted)', 'color-mix(in srgb, var(--mm-color-muted) 62%, var(--mm-color-ink))', 'color-mix(in srgb, var(--mm-color-muted) 70%, var(--mm-color-canvas))'],
};

// A hash of two integers to [0, 1).
function hash(a, b) {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const settings = (prm = {}) => {
  const p = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...prm };
  return {
    n: Math.round(Math.min(8, Math.max(3, Number(p.bands) || params.bands.default))),
    tilt: (Math.min(20, Math.max(-20, Number(p.tilt) || 0)) * Math.PI) / 180,
    sign: p.side === 'right' ? -1 : 1,
    colours: PAIRS[p.pair] ?? PAIRS.accent,
  };
};

/**
 * The bands at linear time l of the cut, in frame pixels: [{ points: [[x, y], ...], fill }].
 * Sweep coordinates: u along the sweep, v across it, both about the frame centre; the rectangle
 * |u| <= U, |v| <= V contains the frame however it is tilted.
 */
export function geometry(W, H, l, prm, ease = smooth) {
  const { n, tilt, sign, colours } = settings(prm);
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const U = (W * Math.abs(cos) + H * Math.abs(sin)) / 2, V = (W * Math.abs(sin) + H * Math.abs(cos)) / 2;
  const m = Math.min(W, H);
  const wave = 0.018 * m, rag = 0.08 * m, lap = 3 * wave;   // overlap > two waves, so bands never part
  const step = (2 * V + 2 * wave) / n;
  const toFrame = ([u, v]) => [W / 2 + sign * u * cos - v * sin, H / 2 + sign * u * sin + v * cos];
  const out = [];
  for (let i = 0; i < n; i++) {
    const delay = STAGGER * hash(i, 11);
    const sIn = l < 0.5 ? ease(clamp01((2 * l - delay) / (1 - delay))) : 1;
    const sOut = l < 0.5 ? 0 : ease(clamp01((2 * l - 1 - delay) / (1 - delay)));
    const lead0 = -U - 1 + sIn * (2 * U + rag + 2);          // every lead point is past -U at 0, past U at 1
    const trail0 = -U - 1 - rag + sOut * (2 * U + 2 * rag + 2);
    const top = -V - wave + i * step - lap / 2, bottom = -V - wave + (i + 1) * step + lap / 2;
    const vAt = (k) => top + ((bottom - top) * k) / (ENDS - 1);
    const lead = (k) => lead0 - rag * (0.25 + 0.75 * hash(i, 100 + k));
    const trail = (k) => Math.min(lead(k), trail0 + rag * hash(i, 200 + k));
    const edge = (v0, a, b, phase) => {
      const pts = [];
      for (let j = 0; j < EDGE; j++) {
        const u = a + ((b - a) * j) / (EDGE - 1);
        pts.push([u, v0 + wave * Math.sin(u / (0.07 * W + 40) + phase)]);
      }
      return pts;
    };
    if ([...Array(ENDS).keys()].every((k) => lead(k) <= trail(k))) continue;   // dragged off
    const pts = [
      ...edge(top, trail(0), lead(0), i * 1.7),
      ...[...Array(ENDS).keys()].map((k) => [lead(k), vAt(k)]),
      ...edge(bottom, lead(ENDS - 1), trail(ENDS - 1), i * 2.3 + 1),
      ...[...Array(ENDS).keys()].reverse().map((k) => [trail(k), vAt(k)]),
    ];
    out.push({ points: pts.map(toFrame).map(round), fill: colours[i % 2] });
    // one dry streak inside the band, trailing the lead
    const sv = top + (bottom - top) * (0.3 + 0.4 * hash(i, 300)), sh = (bottom - top) * 0.1;
    const sb = lead0 - rag * 1.6, sa = Math.max(trail0 + rag, sb - (0.35 + 0.3 * hash(i, 301)) * 2 * U);
    if (sb > sa) {
      out.push({ points: [[sa, sv], [sb, sv + sh * 0.3], [sb - rag * 0.5, sv + sh], [sa, sv + sh * 0.8]].map(toFrame).map(round), fill: colours[2] });
    }
  }
  return out;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}
function hide(el) { if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } }

export default {
  name: 'brush-wipe',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const l = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const drawn = l < 0.5 ? from : to;
    hide(l < 0.5 ? to : from);
    if (!drawn) return;
    const W = drawn.offsetWidth || 1, H = drawn.offsetHeight || 1;
    const ease = (x) => (ctx.ease ? ctx.ease('move', x) : smooth(x));
    const doc = drawn.ownerDocument ?? document;
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'mm-tx-brush');
    svg.setAttribute('data-mm-overlay', '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const band of geometry(W, H, l, ctx.params, ease)) {
      const poly = doc.createElementNS(SVG, 'polygon');
      poly.setAttribute('points', band.points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' '));
      poly.setAttribute('style', `fill: ${band.fill}`);
      svg.appendChild(poly);
    }
    drawn.appendChild(svg);
  },
};

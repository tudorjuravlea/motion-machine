// line-draw: a polyline drawn by p. The points come from the `points` param (or data-points):
// "x,y x,y ..." pairs separated by spaces or semicolons, or a bare list of y values "4,9,7,12"
// spaced evenly in x. Larger y draws higher. The stroke is drawn with pathLength 1, so the
// dash length is p itself; a dot rides the head. No library, no namespace string: the SVG is
// built from numbers by the HTML parser. When the beat carries a value, it counts above the line.
import { count } from '../../../runtime/kit/count.js';

const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const W = 200, H = 100, PAD = 8;           // viewBox units
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const PARAMS = {
  points: { type: 'string', default: '', meaning: 'x,y pairs separated by spaces, or a comma list of y values' },
  thick: { type: 'number', default: 1.2, meaning: 'stroke width in viewBox units (the chart is 200 wide)' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the readout' },
  prefix: { type: 'string', default: '', meaning: 'text before the readout' },
  suffix: { type: 'string', default: '', meaning: 'text after the readout' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the readout' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export function parsePoints(src) {
  const s = String(src ?? '').trim();
  if (!s) return [];
  const pairs = /[\s;]/.test(s);
  const toks = s.split(/[\s;]+/).filter(Boolean);
  const pts = pairs
    ? toks.map((t) => t.split(',').map(Number)).filter((a) => a.length === 2 && a.every(Number.isFinite))
    : toks[0].split(',').map(Number).filter(Number.isFinite).map((y, i) => [i, y]);
  return pts.length >= 2 ? pts : [];
}

function fitPoints(pts) {
  const xs = pts.map((a) => a[0]), ys = pts.map((a) => a[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = x1 > x0 ? (W - 2 * PAD) / (x1 - x0) : 0, sy = y1 > y0 ? (H - 2 * PAD) / (y1 - y0) : 0;
  return pts.map(([x, y]) => [PAD + (x - x0) * sx, H - PAD - (y - y0) * sy]);
}

// The point a fraction f of the way along the polyline's length.
function along(P, f) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); total += d; }
  let rest = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (rest <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, rest / seg[i]) : 0;
      return [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k];
    }
    rest -= seg[i];
  }
  return P[P.length - 1];
}

export default {
  name: 'line-draw',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const q = clamp01(p);
    const P = fitPoints(parsePoints(prm.points || el.dataset.points || el.dataset.pPoints));
    const thick = Math.min(6, Math.max(0.3, num(prm.thick, 1.2)));
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';

    el.classList.add('mm-line');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    if (el.dataset.value !== undefined && el.dataset.value !== '') {
      const r = doc.createElement('div');
      r.className = 'mm-line__readout';
      count(r, 0, num(el.dataset.value, 0), q, {
        fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))),
        prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''),
      });
      el.append(r);
    }
    if (!P.length) return;
    const head = along(P, q);
    const pts = P.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const box = doc.createElement('div');
    box.className = 'mm-line__box';
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`
      + `<polyline class="mm-line__stroke" points="${pts}" pathLength="1" fill="none" stroke-width="${thick}"`
      + ` stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${q.toFixed(4)} 1"${q < 0.002 ? ' opacity="0"' : ''}/>`
      + `<circle class="mm-line__dot" cx="${head[0].toFixed(2)}" cy="${head[1].toFixed(2)}" r="${(thick * 2).toFixed(2)}"${q < 0.002 ? ' opacity="0"' : ''}/>`
      + `</svg>`;
    el.append(box);
  },
};

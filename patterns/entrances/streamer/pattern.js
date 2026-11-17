// entrances/streamer: the element flies in along an arc, trailing a ribbon in a palette role that
// flutters and catches up as it lands. The ribbon is faked from delayed copies of the element's own
// motion (runtime/kit/trail.js): point i is where the trailing edge was i·lag seconds ago, so it needs no
// simulation and any instant draws alone. The element flies for the first 60 % of the entrance and the
// ribbon's tail, 40 % of it behind, reaches it by the end: at p = 1 nothing is written. Writes translate and opacity
// on the element and one SVG behind its content (the element is isolated, so the ribbon stays above
// what lies under it and below its own text). Type never overshoots: the flight eases into its place.
import { trailOf, polygonPath } from '../../../runtime/kit/trail.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NS = 'http://www.w3.org/2000/svg';
const N = 16, TAIL = 0.4;   // the ribbon's points, and the share of the entrance its tail lags the element by

const params = {
  from: { type: 'enum(below|left|right)', default: 'below', meaning: 'where the element flies in from; the ribbon trails from its edge on that side' },
  distance: { type: 'number', default: 3, meaning: 'how far it flies, in multiples of the format base size (ctx.unit), before the style multiplier' },
  role: { type: 'enum(accent|ink|muted|line)', default: 'accent', meaning: 'the palette role of the ribbon' },
  width: { type: 'number', default: 0.9, meaning: 'the ribbon\'s width at the element, in multiples of the base size; it tapers to a fifth of that at its free end' },
  wave: { type: 'number', default: 1, meaning: 'how much the ribbon flutters, in multiples of the base size at its free end; the flutter dies out as the element lands (0 is a straight trail)' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'streamer',
  group: 'entrances',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    if (p >= 1) { el.style.translate = 'none'; el.style.opacity = ''; return; }
    const d = Math.max(0.2, Number(ctx.d) || 1), t = Math.max(0, Number(ctx.u) || 0);
    const lag = (TAIL * d) / N, flight = d - TAIL * d;   // the element lands at 60 % of the entrance; the tail catches up by its end
    const D = Math.max(0, Number(prm.distance)) * ctx.unit * (ctx.style.motion?.travel ?? 1);
    const from = ['left', 'right', 'below'].includes(prm.from) ? prm.from : 'below';
    // the flight: a quadratic arc from the start offset to the place, eased in and out (smoothstep), so the
    // ribbon streams behind it for the whole flight rather than only at a front-loaded start
    const [sx, sy, cx, cy] = from === 'left' ? [-D, 0.9 * D, -0.9 * D, -0.9 * D] : from === 'right' ? [D, 0.9 * D, 0.9 * D, -0.9 * D] : [0.6 * D, D, -0.9 * D, 0.2 * D];
    const offset = (s) => {
      const x = clamp01(s / flight), q = x * x * (3 - 2 * x), r = 1 - q;
      return [r * r * sx + 2 * r * q * cx, r * r * sy + 2 * r * q * cy];
    };
    const [ox, oy] = offset(t);
    el.style.translate = `${ox.toFixed(3)}px ${oy.toFixed(3)}px`;
    const o = clamp01(t / (flight * 0.08));
    el.style.opacity = o >= 1 ? '' : String(o);
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    // the ribbon, in the element's own pixels: where its trailing edge was, less where the element is now
    const [ax, ay] = from === 'left' ? [0, h / 2] : from === 'right' ? [w, h / 2] : [w / 2, h];
    const settle = 1 - clamp01(t / flight);
    const { outline } = trailOf((s) => { const [x, y] = offset(s); return [ax + x - ox, ay + y - oy]; }, t,
      { n: N, lag, wave: Number(prm.wave) * ctx.unit * settle, width: [Number(prm.width) * ctx.unit, Number(prm.width) * ctx.unit * 0.2] });
    const doc = el.ownerDocument, svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mm-streamer');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', polygonPath(outline));
    path.style.fill = `var(--mm-color-${['accent', 'ink', 'muted', 'line'].includes(prm.role) ? prm.role : 'accent'})`;
    svg.append(path);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    el.prepend(svg);
  },
};

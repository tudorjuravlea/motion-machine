// emphasis/countdown-clock: urgency. A clock face appears over (or under) the slot, its hand sweeps
// a full turn (or more) at a steady rate, and a band of slanted stripes scrolls behind the text for
// the length of the window; then the clock and the stripes are gone and the slot is plain again.
// Finite: the hand turns `turns` times and stops, the stripes travel a fixed distance. Writes an SVG
// clock and a stripe band inside the slot (and a relative position and isolation on the slot); a
// seek restores them, and at p = 0 and p = 1 nothing is written.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => String(Math.round(x * 10) / 10);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const NS = 'http://www.w3.org/2000/svg';
const IN = 0.1, OUT = 0.9;   // the clock and the stripes come in over the first tenth and leave over the last

const params = {
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the clock and the stripes' },
  turns: { type: 'number', default: 1, meaning: 'how many full turns the hand makes over the window, 1 to 4' },
  place: { type: 'enum(above|below)', default: 'above', meaning: 'where the clock sits against the slot' },
  size: { type: 'number', default: 0.2, meaning: 'the clock\'s diameter, as a share of the frame\'s short side, 0.08 to 0.3' },
  stripes: { type: 'boolean', default: true, meaning: 'a band of slanted stripes scrolls behind the text' },
  weight: { type: 'number', default: 0.005, meaning: 'the clock\'s line weight, as a share of the frame\'s short side, 0.002 to 0.02' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) && v !== '' && v != null ? n : d)); };

/**
 * The window's state at linear progress q: `presence` (how far the clock and stripes are in, 0 to 1,
 * eased by the caller), `turn` (the hand's angle in degrees from twelve o'clock, clockwise) and
 * `scroll` (how far the stripes have travelled, 0 to 1). All zero outside the window. Pure.
 */
export function stateAt(q, turns = 1) {
  if (!(q > 0) || q >= 1) return { presence: 0, turn: 0, scroll: 0 };
  const sweep = clamp01((q - IN * 0.8) / (OUT - IN * 0.8));
  return { presence: Math.min(clamp01(q / IN), clamp01((1 - q) / (1 - OUT))), turn: 360 * num(turns, 1, 1, 4) * sweep, scroll: q };
}

function svgEl(doc, name, attrs) {
  const e = doc.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export default {
  name: 'countdown-clock',
  group: 'emphasis',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q <= 0 || q >= 1 || p <= 0 || p >= 1) return;
    const prm = { ...DEFAULTS, ...ctx.params };
    const tone = ['accent', 'ink', 'muted'].includes(prm.tone) ? prm.tone : 'accent';
    const st = stateAt(q, prm.turns);
    const presence = ctx.ease ? ctx.ease('enter', st.presence) : st.presence;
    if (!(presence > 0)) return;
    const doc = el.ownerDocument, cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    const stage = el.closest?.('.mm-stage'), short = Math.min(stage?.offsetWidth || 1080, stage?.offsetHeight || 1080);
    const wrap = doc.createElement('span');
    wrap.className = `mm-countdown mm-countdown--${tone}`;
    wrap.setAttribute('aria-hidden', 'true');
    el.append(wrap);
    if (prm.stripes !== false && prm.stripes !== 'false') {
      const band = doc.createElement('span');
      band.className = 'mm-countdown__band';
      band.style.opacity = r3(presence);
      band.style.backgroundPosition = `${r1(st.scroll * (ctx.unit ?? 160) * 1.5)}px 0`;
      wrap.append(band);
    }
    const S = num(prm.size, DEFAULTS.size, 0.08, 0.3) * short, pen = num(prm.weight, DEFAULTS.weight, 0.002, 0.02) * short * (100 / S);
    const svg = svgEl(doc, 'svg', { class: 'mm-countdown__clock', viewBox: '0 0 100 100', width: r1(S), height: r1(S) });
    svg.setAttribute('data-place', prm.place === 'below' ? 'below' : 'above');
    svg.setAttribute('data-align', cs.textAlign === 'center' ? 'center' : 'start');
    if (cs.textAlign === 'center') svg.style.marginLeft = `${r1(-S / 2)}px`;
    svg.style.opacity = r3(presence);
    svg.style.scale = r3(0.8 + 0.2 * presence);
    const c = 50, R = 44;
    svg.append(svgEl(doc, 'circle', { class: 'mm-countdown__face', cx: c, cy: c, r: R, 'stroke-width': r1(pen) }));
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6, long = i % 3 === 0, r0 = R - (long ? 9 : 5);
      svg.append(svgEl(doc, 'line', { class: 'mm-countdown__tick', x1: r1(c + R * Math.sin(a) * 0.92), y1: r1(c - R * Math.cos(a) * 0.92), x2: r1(c + r0 * Math.sin(a)), y2: r1(c - r0 * Math.cos(a)), 'stroke-width': r1(pen * (long ? 1 : 0.6)) }));
    }
    // the swept sector: from twelve o'clock to the hand, in a tint of the role
    const rad = (st.turn * Math.PI) / 180, frac = (st.turn % 360) / 360;
    if (st.turn > 0) {
      const tx = c + (R - 3) * Math.sin(rad), ty = c - (R - 3) * Math.cos(rad);
      const sector = Math.floor(st.turn / 360) > 0 && frac < 0.001
        ? `M${c} ${c}m${-(R - 3)} 0a${R - 3} ${R - 3} 0 1 0 ${2 * (R - 3)} 0a${R - 3} ${R - 3} 0 1 0 ${-2 * (R - 3)} 0Z`
        : `M${c} ${c}L${c} ${c - (R - 3)}A${R - 3} ${R - 3} 0 ${frac > 0.5 ? 1 : 0} 1 ${r1(tx)} ${r1(ty)}Z`;
      svg.append(svgEl(doc, 'path', { class: 'mm-countdown__sweep', d: sector }));
    }
    svg.append(svgEl(doc, 'line', { class: 'mm-countdown__hand', x1: c, y1: c, x2: r1(c + (R - 6) * Math.sin(rad)), y2: r1(c - (R - 6) * Math.cos(rad)), 'stroke-width': r1(pen * 1.3) }));
    svg.append(svgEl(doc, 'circle', { class: 'mm-countdown__pin', cx: c, cy: c, r: r1(pen * 1.4) }));
    wrap.append(svg);
  },
};

// data/gauge: a value on a dial. Seven variants share one param set: arc (a 270 degree arc),
// semi (a half dial), needle (a ticked dial and a needle that swings to the value and settles),
// clock (a face whose hand sweeps, a wedge trailing it), rings (up to three concentric rings),
// radial-bars (up to four concentric bars opening from twelve o'clock) and meter (a linear track
// with min and max ticks and a notch riding the fill's head). Arcs are drawn by stroke-dasharray
// from p, the readout counts through the kit's count() in step with them, and p is clamped at 1:
// the dial never passes the fact. The needle swings on the style's `move` ease over the first
// 70 % of the entrance and settles with a short damped wobble (a pure function of the entrance's
// seconds, exactly zero at rest). The SVG is built from numbers only, by the HTML parser; every
// word is DOM text, so the gate reads it.
import { count } from '../../../runtime/kit/count.js';

const VARIANTS = ['arc', 'semi', 'needle', 'clock', 'rings', 'radial-bars', 'meter'];
const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const TONES = ['accent', 'ink', 'muted'];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const f3 = (x) => x.toFixed(3);
const R = 42;   // outer radius in viewBox units (the dial is 100 wide)

// per dial variant: the share of the circle it sweeps, where it starts (degrees clockwise from
// three o'clock), its own stroke weight (viewBox units) and how many series it takes
const DIAL = {
  arc: { sweep: 0.75, start: 135, thick: 8, max: 1 },
  semi: { sweep: 0.5, start: 180, thick: 8, max: 1 },
  needle: { sweep: 0.75, start: 135, thick: 3, max: 1 },
  rings: { sweep: 1, start: -90, thick: 8, max: 3 },
  'radial-bars': { sweep: 0.75, start: -90, thick: 5, max: 4 },
};
const SETTLE_AT = 0.7;   // the needle reaches the value here; the rest of the entrance is its wobble

const PARAMS = {
  variant: { type: 'enum(arc|semi|needle|clock|rings|radial-bars|meter)', default: 'arc', meaning: 'the dial: arc (270 degrees), semi (half), needle (ticks and a swinging needle), clock (a sweeping hand), rings (up to three concentric), radial-bars (up to four concentric bars), meter (a linear track with min and max ticks and a notch)' },
  min: { type: 'number', default: 0, meaning: 'the value at the start of the dial' },
  max: { type: 'number', default: 100, meaning: 'the value at the end of the dial' },
  values: { type: 'string', default: '', meaning: 'rings and radial-bars: a comma list of up to three (four) values, each on its own ring; empty uses the beat\'s value alone' },
  labels: { type: 'string', default: '', meaning: 'rings and radial-bars: a comma list of names, one per value, written in the legend' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role that carries the value (the first ring); further rings take the other roles in turn' },
  thick: { type: 'number', default: 0, meaning: 'stroke weight in viewBox units (the dial is 100 wide, so a share of its width); 0 takes the variant\'s own' },
  ticks: { type: 'number', default: 0, meaning: 'needle and clock: how many tick marks; 0 takes the variant\'s own (11 and 12)' },
  settle: { type: 'number', default: 0.04, meaning: 'needle: the wobble after the swing, as a share of the dial\'s sweep; 0 stops it dead on the value' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the readout' },
  format: { type: 'enum(plain|compact)', default: 'plain', meaning: 'plain writes the whole number; compact writes a scaled unit (14K, 1.2M)' },
  prefix: { type: 'string', default: '', meaning: 'text before the readout' },
  suffix: { type: 'string', default: '%', meaning: 'text after the readout' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h2', meaning: 'the style size role of the readout; the dial is seven times it wide' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

/** The roles of a dial's series: the hero first, then the other two in the order ink, muted, accent; a fourth repeats the hero. */
export function rolesFor(tone, n = 3) {
  const hero = TONES.includes(tone) ? tone : 'accent';
  const seq = [hero, ...['ink', 'muted', 'accent'].filter((r) => r !== hero)];
  return Array.from({ length: n }, (_, i) => seq[i % seq.length]);
}

/** The share of a dial a value fills, between 0 and 1. */
export function fraction(value, min, max) {
  const span = max - min;
  return span > 0 ? clamp01((value - min) / span) : 0;
}

/**
 * The needle's travel at the entrance's linear time q (0 to 1), as a share of the way to the
 * value: it swings to 1 on `ease` over the first SETTLE_AT of the entrance, then wobbles around
 * 1 with a damped sine of `settle` (a share of the whole dial, over the value's share `f`) and is
 * exactly 1 again at q = 1.
 */
export function swing(q, ease, settle = 0, f = 1) {
  const x = clamp01(q);
  const swung = ease(clamp01(x / SETTLE_AT));
  if (x <= SETTLE_AT || !(settle > 0) || !(f > 0)) return swung;
  const r = (x - SETTLE_AT) / (1 - SETTLE_AT);
  return swung + (settle / f) * (1 - r) ** 2 * Math.sin(r * 3 * Math.PI);
}

const pt = (deg, r) => [50 + r * Math.cos((deg * Math.PI) / 180), 50 + r * Math.sin((deg * Math.PI) / 180)];
const circle = (r, cls, len, thick, rot, hide) => `<circle class="${cls}" cx="50" cy="50" r="${r}" fill="none" stroke-width="${thick}" stroke-linecap="round" transform="rotate(${rot} 50 50)" stroke-dasharray="${f3(len)} ${f3(2 * Math.PI * r)}"${hide ? ' opacity="0"' : ''}/>`;
const line = (a, b, cls, w) => `<line class="${cls}" x1="${f3(a[0])}" y1="${f3(a[1])}" x2="${f3(b[0])}" y2="${f3(b[1])}" stroke-width="${w}" stroke-linecap="round"/>`;

export default {
  name: 'gauge',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const doc = el.ownerDocument;
    const variant = VARIANTS.includes(prm.variant) ? prm.variant : 'arc';
    const size = SIZES.includes(prm.size) ? prm.size : 'h2';
    const min = num(prm.min, 0), max = num(prm.max, 100);
    const q = clamp01(p);
    const lin = p >= 1 ? 1 : ctx?.u != null && ctx?.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : q;
    const ease = (x) => (ctx?.ease ? ctx.ease('move', x) : x);
    const dial = DIAL[variant];
    const multi = dial && dial.max > 1;
    let list = String(prm.values ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter(Number.isFinite);
    if (!multi || !list.length) list = [num(el.dataset.value, min)];
    list = list.slice(0, dial ? dial.max : 1);
    const names = String(prm.labels ?? '').split(',').map((s) => s.trim());
    const roles = rolesFor(prm.tone, list.length);
    const thick = Math.min(20, Math.max(0.5, num(prm.thick, 0) > 0 ? num(prm.thick, 0) : dial ? dial.thick : variant === 'clock' ? 1.6 : 4));
    const fmt = { fix: Math.min(4, Math.max(0, Math.round(num(prm.fix, 0)))), prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? ''), compact: prm.format === 'compact' };

    el.classList.add('mm-gauge');
    el.dataset.variant = variant;
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    const box = doc.createElement('div');
    box.className = 'mm-gauge__box';
    const readout = (cls, to, from = 0, at = q) => {
      const r = doc.createElement('div');
      r.className = cls;
      count(r, from, to, at, fmt);
      return r;
    };
    let svg = '';
    let body = [];

    if (variant === 'arc' || variant === 'semi') {
      const f = fraction(list[0], min, max);
      const len = 2 * Math.PI * R * dial.sweep;
      svg = `<svg viewBox="0 0 100 ${variant === 'semi' ? 58 : 100}" aria-hidden="true">`
        + circle(R, 'mm-gauge__track', len, thick, dial.start, false)
        + circle(R, `mm-gauge__fill mm-gauge__fill--${roles[0]}`, len * f * q, thick, dial.start, len * f * q < 0.5)
        + '</svg>';
      body = [readout('mm-gauge__readout', list[0], min)];
    } else if (variant === 'needle') {
      const f = fraction(list[0], min, max);
      const n = Math.min(41, Math.max(2, Math.round(num(prm.ticks, 0)) || 11));
      const sweepDeg = dial.sweep * 360;
      const t = swing(lin, ease, num(prm.settle, 0.04), f);   // the needle's share of the way to the value
      const lit = clamp01(f * ease(clamp01(lin / SETTLE_AT)));   // the ticks it has passed light up, without the wobble
      let ticks = '';
      for (let i = 0; i < n; i++) {
        const a = dial.start + (sweepDeg * i) / (n - 1), long = i % 5 === 0 || i === n - 1;
        ticks += line(pt(a, R - thick - (long ? 6 : 3.5)), pt(a, R - thick - 1), `mm-gauge__tick${i / (n - 1) <= lit + 1e-9 ? ' mm-gauge__tick--lit' : ''}`, long ? 1.3 : 0.8);
      }
      const ang = dial.start + sweepDeg * f * t;
      svg = '<svg viewBox="0 0 100 100" aria-hidden="true">'
        + circle(R, 'mm-gauge__track', 2 * Math.PI * R * dial.sweep, thick, dial.start, false)
        + ticks
        + `<g transform="rotate(${f3(ang)} 50 50)">${line([50, 50], [50 + R - thick - 3, 50], `mm-gauge__needle mm-gauge__needle--${roles[0]}`, Math.max(1.2, thick * 0.9))}</g>`
        + `<circle class="mm-gauge__hub mm-gauge__hub--${roles[0]}" cx="50" cy="50" r="${f3(Math.max(2.4, thick * 1.2))}"/>`
        + '</svg>';
      body = [readout('mm-gauge__readout', list[0], min, clamp01(ease(clamp01(lin / SETTLE_AT))))];
    } else if (variant === 'clock') {
      const f = fraction(list[0], min, max);
      const n = Math.min(60, Math.max(4, Math.round(num(prm.ticks, 0)) || 12));
      const sweep = 360 * f * q;
      let ticks = '';
      for (let i = 0; i < n; i++) {
        const a = -90 + (360 * i) / n, long = i % (n >= 12 ? Math.round(n / 4) : 1) === 0;
        ticks += line(pt(a, R - (long ? 8 : 5)), pt(a, R - 1.5), 'mm-gauge__tick', long ? 1.4 : 0.9);
      }
      const [ex, ey] = pt(-90 + sweep, R - 1.5);
      const wedge = sweep > 0.4 ? `<path class="mm-gauge__wedge mm-gauge__wedge--${roles[0]}" d="M50 50 L50 ${f3(50 - (R - 1.5))} A${R - 1.5} ${R - 1.5} 0 ${sweep > 180 ? 1 : 0} 1 ${f3(ex)} ${f3(ey)} Z"/>` : '';
      svg = '<svg viewBox="0 0 100 100" aria-hidden="true">'
        + `<circle class="mm-gauge__face" cx="50" cy="50" r="${R}" fill="none" stroke-width="${thick}"/>`
        + wedge + ticks
        + `<g transform="rotate(${f3(sweep)} 50 50)">${line([50, 50], [50, 50 - (R - 7)], `mm-gauge__needle mm-gauge__needle--${roles[0]}`, 2)}</g>`
        + `<circle class="mm-gauge__hub mm-gauge__hub--${roles[0]}" cx="50" cy="50" r="2.6"/>`
        + '</svg>';
      body = [readout('mm-gauge__readout', list[0], min)];
    } else if (variant === 'rings' || variant === 'radial-bars') {
      const gap = thick * (variant === 'rings' ? 0.55 : 0.9);
      let rings = '';
      list.forEach((v, i) => {
        const r = R - i * (thick + gap);
        const len = 2 * Math.PI * r * dial.sweep, f = fraction(v, min, max);
        rings += circle(r, 'mm-gauge__track', len, thick, dial.start, false)
          + circle(r, `mm-gauge__fill mm-gauge__fill--${roles[i]}`, len * f * q, thick, dial.start, len * f * q < 0.5);
      });
      svg = `<svg viewBox="0 0 100 100" aria-hidden="true">${rings}</svg>`;
      const legend = doc.createElement('div');
      legend.className = 'mm-gauge__legend';
      list.forEach((v, i) => {
        const row = doc.createElement('div');
        row.className = 'mm-gauge__row';
        const sw = doc.createElement('i');
        sw.className = `mm-gauge__swatch mm-gauge__swatch--${roles[i]}`;
        const nm = doc.createElement('span');
        nm.className = 'mm-gauge__name';
        nm.textContent = names[i] ?? '';
        row.append(sw, nm, readout('mm-gauge__value', v, min));
        legend.append(row);
      });
      body = [legend];
    } else {   // meter
      const f = fraction(list[0], min, max);
      const x0 = 5, x1 = 95, hx = x0 + (x1 - x0) * f * q;
      const tickEnd = (x) => line([x, 12 - thick / 2 - 3], [x, 12 + thick / 2 + 3], 'mm-gauge__tick mm-gauge__tick--end', 0.9);
      svg = '<svg viewBox="0 0 100 24" aria-hidden="true">'
        + line([x0, 12], [x1, 12], 'mm-gauge__track', thick)
        + (hx - x0 > 0.4 ? line([x0, 12], [hx, 12], `mm-gauge__fill mm-gauge__fill--${roles[0]}`, thick) : '')
        + tickEnd(x0) + tickEnd(x1)
        + `<path class="mm-gauge__notch mm-gauge__notch--${roles[0]}" d="M${f3(hx - 2.6)} ${f3(12 - thick / 2 - 7.2)} L${f3(hx + 2.6)} ${f3(12 - thick / 2 - 7.2)} L${f3(hx)} ${f3(12 - thick / 2 - 2)} Z"/>`
        + '</svg>';
      const ends = doc.createElement('div');
      ends.className = 'mm-gauge__ends';
      for (const v of [min, max]) {
        const e = doc.createElement('span');
        e.className = 'mm-gauge__end';
        count(e, v, v, 1, fmt);
        ends.append(e);
      }
      body = [readout('mm-gauge__readout', list[0], min), ends];
    }

    box.innerHTML = svg;
    // meter and clock put the readout beside the dial in flow; the others overlay it
    if (variant === 'meter') box.prepend(body[0]); else box.append(body[0]);
    if (body[1]) box.append(body[1]);
    el.append(box);
  },
};

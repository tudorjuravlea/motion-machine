// emphasis/keyword-cta: a keyword chip slams on its beat and three small arrows bob toward it a finite
// number of times, then leave. The chip's look (a filled plate, or a quiet outline with `hold: false`)
// is the slot's own CSS, keyed on data-emphasis, so it is there at every rest; this module plays the
// slam and the arrows over the emphasis window on the beat's own seconds (ctx.u):
// - slam: the chip comes down from up to 2.2× and 30 % opacity to 1× in 0.09 s (ease-in), then
//   wobbles out as 0.06·sin(30τ)·e^(−9τ); capped by room.js so it stays inside the safe area;
// - arrows: three small triangles on the side `from`, fading in at 0.1 s, each travelling toward the
//   chip and back `bobs` times (a raised cosine, the three a little out of step), fading out over
//   the last 0.15 s of the window, so at the end of the window they are gone;
// - with `hold: false` the chip is drawn loud for the window and relaxes to its quiet outline at the end.
// At the end of the window it writes nothing and the rest is the CSS look: level type, no transform.
// The slam is meant to be the arrival (the beat has params.instant: true). When the beat has an
// entrance of its own the chip has already been seen whole, so only the wobble and the arrows play, and
// a note for the author goes to mm.warnings.
import { maxScale } from '../../../runtime/kit/room.js';
import { selectorOf } from '../../../runtime/kit/schedule.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const r2 = (x) => Math.round(x * 100) / 100;

const params = {
  from: { type: 'enum(below|above|left|right)', default: 'below', meaning: 'the side of the chip the arrows come from; leave room on that side' },
  bobs: { type: 'number', default: 3, meaning: 'how many times each arrow travels toward the chip and back, 1 to 6' },
  hold: { type: 'boolean', default: true, meaning: 'true: the chip keeps its filled plate after the arrows have gone, a frame that stays on after the speech; false: it relaxes to a quiet outline; among the beat\'s own params so the slot\'s style sees it' },
  tone: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the palette role of the arrows and the plate; among the beat\'s own params' },
  size: { type: 'enum(h1|h2)', default: 'h2', meaning: 'the size role of the keyword; among the beat\'s own params' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const LAND = 0.09, FROM = 2.2, WOBBLE = 0.06, ARROW_IN = 0.1, ARROW_OUT = 0.15;
const DIRS = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0] };

/** How far the arrow `k` (0 to 2) is toward the chip at `u` seconds in a window of `d`: 0 far, 1 at the chip. */
export function bob(u, d, k, bobs) {
  const start = ARROW_IN + 0.04 * k, end = d - ARROW_OUT, span = end - start;
  if (!(span > 0) || u < start || u >= end) return 0;
  const phase = ((u - start) / span) * bobs;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
}

function entranceOf(el, scene) {
  const items = el.ownerDocument?.defaultView?.mm?.schedule?.items;
  const slot = el.dataset?.slot;
  if (!Array.isArray(items) || !slot || scene == null) return 0;
  const it = items.find((x) => x.selector === selectorOf(scene, slot));
  return it && it.d > 0 ? it.d : 0;
}
function warn(el, msg) { const w = el.ownerDocument?.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }

export default {
  name: 'keyword-cta',
  group: 'emphasis',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx?.params };
    const d = num(ctx?.d, 1.2);
    const u = num(ctx?.u, clamp(p, 0, 1) * d);
    if (!(u >= 0) || u >= d || p >= 1) return;
    const entered = entranceOf(el, ctx?.scene);
    if (entered > 0) warn(el, `${selectorOf(ctx.scene, el.dataset.slot)}: emphasis/keyword-cta on a beat with a ${entered.toFixed(2)} s entrance: the chip is seen arriving, so it only wobbles (no slam from large); give the beat params.instant: true to make the slam its arrival`);
    const land = entered > 0 ? 0 : LAND;
    const cap = maxScale(el) ?? Infinity;
    const from = Math.max(1, Math.min(FROM, cap));
    let scale = 1, opacity = 1;
    if (u < land) {
      const e = (u / land) ** 3;
      scale = from + (1 - from) * e;
      opacity = 0.3 + 0.7 * e;
    } else {
      const tau = u - land;
      scale = Math.min(cap, 1 + WOBBLE * Math.sin(30 * tau) * Math.exp(-9 * tau));
    }
    if (Math.abs(scale - 1) > 1e-5) el.style.scale = scale.toFixed(5);
    if (opacity < 1) el.style.opacity = opacity.toFixed(4);
    if (prm.hold === false || prm.hold === 'false') {
      el.style.background = 'var(--mm-kcta-tone)';
      el.style.color = 'var(--mm-kcta-ink)';
    }

    // the arrows
    const [dx, dy] = DIRS[prm.from] ?? DIRS.below;
    const bobs = clamp(Math.round(num(prm.bobs, DEFAULTS.bobs)), 1, 6);
    const fade = Math.min(clamp((u - ARROW_IN) / 0.1, 0, 1), clamp((d - u) / ARROW_OUT, 0, 1));
    if (!(fade > 0)) return;
    const unit = ctx.unit, size = unit * 0.2, gap = unit * 0.1, travel = unit * 0.2, spacing = unit * 0.34;
    const w = el.offsetWidth, h = el.offsetHeight;
    for (let k = 0; k < 3; k++) {
      const a = el.ownerDocument.createElement('span');
      a.className = 'mm-kcta__arrow';
      a.setAttribute('aria-hidden', 'true');
      const t = bob(u, d, k, bobs), lateral = (k - 1) * spacing;
      // out from the chip's edge on that side by the gap and the part of the travel still to go; laid side by side across the other axis
      const out = gap + travel * (1 - t);
      const x = dx === 0 ? w / 2 + lateral - size / 2 : (dx > 0 ? w + out : -out - size);
      const y = dy === 0 ? h / 2 + lateral - size / 2 : (dy > 0 ? h + out : -out - size);
      a.style.cssText = `left:${r2(x)}px;top:${r2(y)}px;width:${r2(size)}px;height:${r2(size)}px;opacity:${r2(fade * 100) / 100};`
        + `clip-path:polygon(${dy > 0 ? '50% 0,0 100%,100% 100%' : dy < 0 ? '50% 100%,0 0,100% 0' : dx > 0 ? '0 50%,100% 0,100% 100%' : '100% 50%,0 0,0 100%'})`;
      el.append(a);
    }
  },
};

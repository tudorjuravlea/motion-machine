// emphasis/stamp: a verdict word is stamped onto the frame. The stamp's look (plate, rules, pits,
// tilt, role) is the slot's own CSS, keyed on data-emphasis, so it is there at every rest; this
// module plays the impact over the emphasis window, on the beat's own seconds (ctx.u):
// - slam: the stamp comes down from up to 2.6× and 30 % opacity to 1× and full in 0.09 s (ease-in, it
//   accelerates into the paper), then wobbles out as 0.05·sin(30τ)·e^(−9τ);
// - press: a quieter 1.18× to 1× in 0.07 s (ease-out), no wobble;
// - on landing the rest of the frame flashes in the lightest palette role, at most half strength,
//   fading linearly over 0.12 s (the slot's own spread shadow, so nothing outside the slot is added);
// - the other filled slots of the scene jolt down and back as e^(−9τ)·cos(22τ).
// The start scale is capped by room.js so the word stays inside the safe area on every frame. At the
// end of the window it writes nothing, and the rest is the CSS look: level type, no transform.
// The slam is meant to be the arrival (the beat has params.instant: true). When the beat has an
// entrance of its own, the stamp has already been seen whole by the time the window opens, so the
// window plays only the landing (wobble, flash, jolt) with no second fall from large and faint, and
// a note for the author goes to mm.warnings.
import { maxScale } from '../../../runtime/kit/room.js';
import { selectorOf } from '../../../runtime/kit/schedule.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const params = {
  personality: { type: 'enum(slam|press)', default: 'slam', meaning: 'slam: down from up to 2.6× (as the room allows) with a wobble; press: a quiet set-down from up to 1.18×' },
  tone: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the palette role of the ink; give it among the beat\'s own params so the slot\'s style sees it' },
  tilt: { type: 'enum(left|right|none)', default: 'left', meaning: 'the plate turns 7° anticlockwise, clockwise or not at all; the word stays level; among the beat\'s own params' },
  size: { type: 'enum(h1|h2)', default: 'h1', meaning: 'the size role of the word, whatever the slot\'s own size; among the beat\'s own params' },
  flash: { type: 'number', default: 0.35, meaning: 'strength of the flash in the lightest role at the landing, 0 to 0.5' },
  shake: { type: 'number', default: 6, meaning: 'how far the other slots jolt at the landing, in px; 0 for none' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const KINDS = {
  slam: { from: 2.6, land: 0.09, ease: (x) => x * x * x, wobble: 0.05 },
  press: { from: 1.18, land: 0.07, ease: (x) => 1 - (1 - x) ** 3, wobble: 0 },
};
const FLASH_S = 0.12;
const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];

// relative luminance of a #rgb / #rrggbb colour, -1 when it cannot be read
function luminance(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return -1;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const lin = (i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}
/** The palette role with the highest luminance: what a flash of light is made of. */
export function lightestRole(color = {}) {
  let best = 'canvas', l = -Infinity;
  for (const r of ROLES) { const v = luminance(color[r]); if (v > l) { l = v; best = r; } }
  return best;
}

// The beat's entrance in seconds, read from the kit's schedule; 0 when it is instant or there is no schedule.
function entranceOf(el, scene) {
  const items = el.ownerDocument?.defaultView?.mm?.schedule?.items;
  const slot = el.dataset?.slot;
  if (!Array.isArray(items) || !slot || scene == null) return 0;
  const it = items.find((x) => x.selector === selectorOf(scene, slot));
  return it && it.d > 0 ? it.d : 0;
}
// A note for the story author in mm.warnings, once per slot.
function warn(el, msg) { const w = el.ownerDocument?.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }

function neighbours(el) {
  const cam = el.closest?.('.mm-camera');
  if (!cam) return [];
  return [...cam.querySelectorAll('[data-slot]:not([data-empty])')].filter((n) => n !== el && !n.contains(el) && !el.contains(n));
}

export default {
  name: 'stamp',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx?.params };
    const d = num(ctx?.d, 0.7);
    const u = num(ctx?.u, clamp(p, 0, 1) * d);
    if (!(u >= 0) || u >= d || p >= 1) return;
    const kind = KINDS[prm.personality] ?? KINDS.slam;
    const entered = entranceOf(el, ctx?.scene);
    if (entered > 0) warn(el, `${selectorOf(ctx.scene, el.dataset.slot)}: emphasis/stamp on a beat with a ${entered.toFixed(2)} s entrance: the stamp is seen arriving, so it only lands (no slam from large); give the beat params.instant: true to make the slam its arrival`);
    const land = entered > 0 ? 0 : kind.land;
    const cap = maxScale(el) ?? Infinity;
    const from = Math.max(1, Math.min(kind.from, cap));
    let scale = 1, opacity = 1;
    if (u < land) {
      const e = kind.ease(u / land);
      scale = from + (1 - from) * e;
      opacity = 0.3 + 0.7 * e;
    } else if (kind.wobble) {
      const tau = u - land;
      scale = Math.min(cap, 1 + kind.wobble * Math.sin(30 * tau) * Math.exp(-9 * tau));
    }
    if (Math.abs(scale - 1) > 1e-5) el.style.scale = scale.toFixed(5);
    if (opacity < 1) el.style.opacity = opacity.toFixed(4);
    if (u < land) return;
    const tau = u - land;
    const a = clamp(num(prm.flash, DEFAULTS.flash), 0, 0.5) * Math.max(0, 1 - tau / FLASH_S);
    if (a > 1e-3) {
      el.style.zIndex = '1';
      el.style.boxShadow = `0 0 0 200vmax color-mix(in srgb, var(--mm-color-${lightestRole(ctx?.style?.color)}) ${(a * 100).toFixed(2)}%, transparent)`;
    }
    const dy = clamp(num(prm.shake, DEFAULTS.shake), 0, 40) * Math.exp(-9 * tau) * Math.cos(22 * tau);
    if (Math.abs(dy) > 0.05) {
      for (const n of neighbours(el)) if (!n.style.translate || n.style.translate === 'none') n.style.translate = `0 ${dy.toFixed(3)}px`;
    }
  },
};

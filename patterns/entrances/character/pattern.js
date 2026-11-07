// entrances/character: the brand's mascot (style.mascot, drawn by runtime/kit/rig.js) hops into
// its slot: it fades in crouched, flies a short arc stretched at both ends and lands squashed,
// ringing down to its rest pose by the end of the entrance. Past the entrance it stays alive: an
// idle locked to the beat grid of the piece's time (squash peaks on the beat) fades in over 0.4 s,
// and it blinks. The kit reports the slot finished from the end of the entrance; the idle is an
// acting layer inside the slot's box, which does not move. When the slot also carries
// emphasis/act, that emphasis acts the change to `to` and this pattern keeps `to` after it.
// `who` names a character of the brand's cast; the brand's extra parts (ears, a tail, an antenna)
// swing with follow-through on the hop, read from the pose a moment earlier.
// The stage yields to the text: its CSS asks for no more than the room its layout leaves, and
// when a line of the scene still crosses the safe margin (a tight line-height lets glyphs hang
// past their boxes) the stage gives up twice that much, read with room.js from the layout alone.
import { resolveMascot, characterPose, draw, ACT, MOODS } from '../../../runtime/kit/rig.js';
import { boxOf, inkOf, safeArea } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const RAMP = 0.4;   // seconds the idle takes to fade in after the landing

const params = {
  mood: { type: 'enum(calm|happy|excited|sad|surprised|worried|sleepy|proud)', default: 'calm', meaning: 'the face, colour of the cheeks and idle it arrives with; a mood the brand does not allow is drawn as its first' },
  to: { type: 'enum(none|calm|happy|excited|sad|surprised|worried|sleepy|proud)', default: 'none', meaning: 'the mood emphasis/act changes it to, kept after the act; read only when the beat\'s emphasis is emphasis/act' },
  view: { type: 'enum(front|threeQuarter|side|back)', default: 'front', meaning: 'which drawn view; a view the brand did not draw is made from the front' },
  facing: { type: 'enum(right|left)', default: 'right', meaning: 'left mirrors the drawing' },
  look: { type: 'enum(center|left|right|up|down)', default: 'center', meaning: 'where the eyes look, added to the mood\'s own glance' },
  from: { type: 'enum(place|left|right)', default: 'place', meaning: 'place hops on the spot; left or right hops in from that side' },
  d: { type: 'number', default: 1, meaning: 'how far a hop from the side travels, in widths of the character (0.2 to 3)' },
  idle: { type: 'number', default: 1, meaning: 'how much the idle moves, 0 (still) to 1.5' },
  bpm: { type: 'number', default: 0, meaning: 'the beat grid the idle keeps; 0 reads the style\'s sound.bpm' },
  offset: { type: 'number', default: 0, meaning: 'seconds of piece time where the beat grid starts (the first beat of the track)' },
  who: { type: 'string', default: '', meaning: 'a character of the brand\'s cast by name (mascot.cast); empty draws the brand\'s main character' },
  sheet: { type: 'enum(off|moods|views|all)', default: 'off', meaning: 'a model sheet at rest instead of one character: the front view in every mood, every view in the beat\'s mood, or every view in every mood' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

// shrinks the stage by twice the furthest any text in its scene crosses the safe area's top or
// bottom: the layouts centre their content, so each edge gains half. Layout offsets only, so the
// height is the same at every seek; nothing happens without a laid-out DOM.
function yieldToText(el) {
  const me = boxOf(el), area = safeArea(el);
  if (!me || !area) return;
  let over = 0;
  for (const n of (el.closest('.mm-camera') ?? el.parentElement).querySelectorAll('[data-slot]:not([data-empty]), [data-keep]')) {
    if (n === el || n.contains(el) || !n.textContent.trim()) continue;
    const ink = inkOf(n);
    if (ink) over = Math.max(over, area.y0 - ink.y0, ink.y1 - area.y1);
  }
  if (over > 0.5) el.style.height = `${Math.max(0, me.y1 - me.y0 - 2 * over)}px`;
}

/** The pose options both character patterns share, from the beat's params and the kit's ctx. */
export function optionsOf(prm, ctx) {
  const deck = !!ctx.deck;
  const bpm = Number(prm.bpm) > 0 ? Number(prm.bpm) : Number(ctx.style?.sound?.bpm) || 120;
  return {
    view: prm.view, facing: prm.facing, look: prm.look, bpm, offset: Number(prm.offset) || 0,
    amp: Math.min(1.5, Math.max(0, Number(prm.idle))), deck, blinks: !deck,
    t: !deck && Number.isFinite(ctx.t) ? ctx.t : Number.isFinite(ctx.u) ? ctx.u : 0,
  };
}

export default {
  name: 'character',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : 1;
    if (q <= 0) return;
    yieldToText(el);
    const m = resolveMascot(ctx.style, prm.who || undefined);
    const o = optionsOf(prm, ctx);
    const after = Number.isFinite(ctx.u) ? ctx.u - ctx.d : Infinity;   // seconds since the landing
    const acted = el.getAttribute('data-emphasis') === 'emphasis/act' && MOODS.includes(prm.to);
    const mood = acted && after >= ACT.dur - 1e-6 ? prm.to : prm.mood;
    const seed = ctx.random();
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const sheet = ['moods', 'views', 'all'].includes(prm.sheet) ? prm.sheet : null;
    const pose = characterPose({
      // progress past 1 (time since the landing, in entrance lengths) lets extra parts settle their swing
      ...o, mascot: m, mood, q: Number.isFinite(ctx.u) && ctx.d > 0 ? ctx.u / ctx.d : q, dur: ctx.d, from: prm.from, d: Math.min(3, Math.max(0.2, Number(prm.d) || 1)), seed,
      idleWeight: o.deck ? 0 : smooth(after / RAMP),
    });
    draw(el, m, pose, { id: `mmrig${Math.floor(seed * 1e9).toString(36)}`, sheet, aspect: w / h });
  },
};

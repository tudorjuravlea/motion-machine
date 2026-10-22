// entrances/card-flip: the slot arrives as a blank card that turns over about its vertical axis to
// show its content. The turn runs 0 to 180 degrees and ends at exactly 180. It is drawn in two
// halves so no face is ever mirrored: for the first quarter turn the card's cover is drawn turning
// away (0 to 90 degrees); for the second the slot itself is drawn turning in from edge-on (-90 to
// 0), which is what a card's far face looks like at 90 to 180. The perspective is chosen from the
// room the layout leaves, so the near edge never carries the type past the safe area. At p = 1 the
// slot is exactly as laid out. Writes transform and transform-origin on the slot, a cover span
// inside it and, while the cover shows, a transparent text fill and a relative position.
import { maxScale, boxOf } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  steps: { type: 'number', default: 0, meaning: 'stops the turn makes, 0 for a smooth turn; 6 gives a hand-animated cadence' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/** The card's turn in degrees at progress p: 0 to 180, exactly 180 at p = 1, in `steps` equal stops when steps > 0. */
export function turnAt(p, steps = 0) {
  const q = clamp01(p);
  if (q >= 1) return 180;
  const n = Math.max(0, Math.round(Number(steps) || 0));
  return 180 * (n > 0 ? Math.floor(q * n + 1e-9) / n : q);
}

/** What is drawn at a turn: the cover turning away, or the content turning in; the drawn angle stays within a quarter turn. */
export function poseOf(turn) {
  if (turn < 90) return { face: 'cover', drawn: turn };
  const drawn = turn - 180;
  return { face: 'content', drawn: drawn === 0 ? 0 : drawn };
}

/**
 * The perspective distance in px for a card w px wide: the near edge grows by P / (P - w / 2) at
 * most, kept within the room (the largest scale the layout allows); Infinity without room, four
 * card widths with no layout to read.
 */
export function depthFor(w, room) {
  if (room == null) return 4 * w;
  if (!(room > 1)) return Infinity;
  return Math.max(4 * w, (w / 2) * (room / (room - 1)));
}

export default {
  name: 'card-flip',
  group: 'entrances',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const turn = turnAt(p, prm.steps);
    if (turn >= 180) return;   // landed: the slot is exactly as laid out
    const { face, drawn } = poseOf(turn);
    const box = boxOf(el);
    const w = box ? box.x1 - box.x0 : el.offsetWidth || 0;
    const P = depthFor(w, maxScale(el, 'center'));
    const rot = Math.abs(drawn) < 1e-9 ? '' : ` rotateY(${drawn.toFixed(4)}deg)`;
    el.style.transformOrigin = 'center';
    el.style.transform = rot ? (Number.isFinite(P) ? `perspective(${P.toFixed(1)}px)${rot}` : rot.trim()) : 'none';
    if (face !== 'cover') return;
    // the cover: a blank card over the slot's own box; the slot's text is not drawn under it
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.webkitTextFillColor = 'transparent';
    const cover = el.ownerDocument.createElement('span');
    cover.className = 'mm-card-flip__cover';
    cover.setAttribute('aria-hidden', 'true');
    el.append(cover);
  },
};

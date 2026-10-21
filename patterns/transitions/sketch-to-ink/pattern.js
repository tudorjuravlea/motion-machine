// transitions/sketch-to-ink: the wireframe becomes the product. Every slot the outgoing scene drew
// with entrances/sketch is inked in the order the pen drew it (press, then the beat's at): its line
// straightens and moves onto the matching slot of the incoming scene (same data-p-shared key, else
// same slot name, never an empty one), the finished slot comes in under it as the sketch's label
// hands over, and the line lifts. The incoming scene is see-through while the cut runs
// (pattern.css), so the outgoing words stay where they are: a slot with the same words in the same
// place waits under them; anything that changes, moves or has no partner leaves, and what is new
// arrives after, so two lines are never in one place.
// It writes --mm-tx-ink (0 to 1) and --mm-tx-ink-to ("scene/slot") on the sketched slots, which
// entrances/sketch reads when the kit draws them later in the same seek (after the camera moves,
// so it measures the finished slot where it really is); --mm-tx-alpha on the slots it shows or
// hides; --mm-tx-ink and --mm-tx-deco on the incoming section. The kit restores every one of those
// styles at the next seek, so at p = 1 nothing remains.
import { INK } from '../../../runtime/kit/rough.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);

const STAGGER = 0.15;   // each piece starts this much of the cut after the one drawn before it
const SPREAD = 0.45;    // at most this much of the cut goes to staggering, however many pieces
const LEAVE = [0.7, 0.85], ARRIVE = [0.85, 1];   // what changes: the old leaves, then the new arrives
const SAME_PX = 2;      // a slot within this of its partner's place and size has not moved

const params = {};

const keyOf = (el) => el.getAttribute('data-shared') ?? el.getAttribute('data-p-shared');
const words = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const live = (el) => el && !el.hasAttribute('data-empty');
const top = (el) => !el.parentElement?.closest('[data-slot]');   // a slot not inside another slot
function slotIn(section, el) {
  const key = keyOf(el);
  const found = (key && [...section.querySelectorAll('[data-slot]')].find((s) => keyOf(s) === key)) || section.querySelector(`[data-slot="${el.getAttribute('data-slot')}"]`);
  return live(found) ? found : null;
}
// the same words in the same place: nothing for the eye to follow
function same(a, b, from, to) {
  if (!a || !b || words(a) !== words(b)) return false;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), fa = from.getBoundingClientRect(), fb = to.getBoundingClientRect();
  return [ra.left - fa.left - (rb.left - fb.left), ra.top - fa.top - (rb.top - fb.top), ra.width - rb.width, ra.height - rb.height].every((d) => Math.abs(d) <= SAME_PX);
}

export default {
  name: 'sketch-to-ink',
  group: 'transitions',
  dur: 'hold',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming, from = ctx.from;
    if (p >= 1 || !from) return;
    const q = clamp01(p);
    const leave = 1 - smooth(LEAVE[0], LEAVE[1], q), arrive = smooth(ARRIVE[0], ARRIVE[1], q);
    to.style.setProperty('--mm-tx-ink', r3(q));   // pattern.css: the incoming scene is see-through while this is set
    to.style.setProperty('--mm-tx-deco', r3(arrive));

    // the sketched slots in the order the pen drew them: press (a deck's step), then at, then the page
    const sketches = [...from.querySelectorAll('[data-slot][data-fx="entrances/sketch"]')].filter(live)
      .map((el, i) => ({ el, i, step: Number(el.dataset.step) || 0, at: Number(el.dataset.at) || 0 }))
      .sort((a, b) => a.step - b.step || a.at - b.at || a.i - b.i).map((s) => s.el);
    const n = sketches.length;
    const step = n > 1 ? Math.min(STAGGER, SPREAD / (n - 1)) : 0, span = 1 - step * (n - 1);
    const handled = new Set(sketches);
    sketches.forEach((a, i) => {
      const k = clamp01((q - i * step) / span);
      a.style.setProperty('--mm-tx-ink', r3(k));
      const b = slotIn(to, a);
      if (!b) return;
      handled.add(b);
      a.style.setProperty('--mm-tx-ink-to', `${to.dataset.scene}/${b.getAttribute('data-slot')}`);
      b.style.setProperty('--mm-tx-alpha', r3(smooth(INK.handover[0], INK.handover[1], k)));
    });

    // everything else: the same words in the same place wait under the outgoing ones and take over
    // at p = 1; the rest of the outgoing scene leaves, then the rest of the incoming one arrives
    const others = [...to.querySelectorAll('[data-slot]')].filter((b) => live(b) && top(b) && !handled.has(b));
    const kept = new Set();
    for (const b of others) {
      const a = slotIn(from, b);
      const waits = a && !handled.has(a) && same(a, b, from, to);
      if (waits) kept.add(a);
      b.style.setProperty('--mm-tx-alpha', waits ? '0' : r3(arrive));
    }
    for (const a of from.querySelectorAll('[data-slot]')) {
      if (live(a) && top(a) && !handled.has(a) && !kept.has(a)) a.style.setProperty('--mm-tx-alpha', r3(leave));
    }
  },
};

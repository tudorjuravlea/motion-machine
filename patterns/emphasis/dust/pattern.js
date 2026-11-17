// emphasis/dust: where a heavy word lands, a low puff of dust spreads out to both sides along its
// base, rises a touch and thins away. Opt-in: it draws only for a brand with a `particles` block, and
// keeps to that block's count and area (runtime/kit/emit.js). Pure in the window's seconds; at p = 0
// and p = 1 it writes nothing.
import { drawBurst } from '../../../runtime/kit/emit.js';

const params = {
  count: { type: 'number', default: 14, meaning: 'puffs in the burst, 1 to 64, never more than the brand\'s particles.max' },
};

export default {
  name: 'dust',
  group: 'emphasis',
  dur: 'slow',
  emitter: true,
  params,
  at(el, p, ctx) {
    drawBurst(el, p, ctx, ([x, y, w, h], S) => ({
      shape: 'puff', count: params.count.default,
      origin: (u) => [x + u * w, y + h + S * 0.03, u < 0.5 ? -1 : 1, -0.15],
      spread: 0.25, speed: [0.15 * S, 0.45 * S], drag: 3.5, gravity: -0.05 * S,
      life: [0.5, 0.9], size: [0.014 * S, 0.026 * S], stagger: 0.03, fade: 0.6,
    }));
  },
};

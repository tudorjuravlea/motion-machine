// emphasis/confetti: on a milestone's landing, palette chips burst up from the top of the text, turn
// and flutter, and fall under gravity, gone before the window ends. Opt-in: it draws only for a brand
// with a `particles` block, and keeps to that block's count and area (runtime/kit/emit.js). Pure in
// the window's seconds; at p = 0 and p = 1 it writes nothing.
import { drawBurst } from '../../../runtime/kit/emit.js';

const params = {
  count: { type: 'number', default: 32, meaning: 'chips in the burst, 1 to 64, never more than the brand\'s particles.max' },
};

export default {
  name: 'confetti',
  group: 'emphasis',
  dur: 'hold',
  emitter: true,
  params,
  at(el, p, ctx) {
    drawBurst(el, p, ctx, ([x, y, w], S) => ({
      shape: 'chip', count: params.count.default,
      origin: (u) => [x + u * w, y - S * 0.02, 0, -1],
      spread: 0.7, speed: [0.7 * S, 1.3 * S], drag: 2.2, gravity: 0.9 * S,
      life: [1.0, 1.5], size: [0.012 * S, 0.02 * S], spin: [-9, 9], stagger: 0.06, fade: 0.3,
    }));
  },
};

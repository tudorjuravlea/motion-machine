// emphasis/sparks: on the beat's landing, a few short sparks leave the edges of the text and fly out,
// slowing fast, falling a little and fading, in the brand's particle roles. Opt-in: it draws only for
// a brand with a `particles` block, and keeps to that block's count and area (runtime/kit/emit.js).
// Pure in the window's seconds; at p = 0 and p = 1 it writes nothing.
import { drawBurst, onPerimeter } from '../../../runtime/kit/emit.js';

const params = {
  count: { type: 'number', default: 18, meaning: 'sparks in the burst, 1 to 64, never more than the brand\'s particles.max' },
};

export default {
  name: 'sparks',
  group: 'emphasis',
  dur: 'slow',
  emitter: true,
  params,
  at(el, p, ctx) {
    drawBurst(el, p, ctx, (box, S) => ({
      shape: 'streak', count: params.count.default,
      origin: (u) => onPerimeter(box, u, S * 0.035),
      spread: 0.35, speed: [0.9 * S, 1.6 * S], drag: 4, gravity: 0.3 * S,
      life: [0.3, 0.6], size: [0.01 * S, 0.016 * S], stagger: 0.04,
    }));
  },
};


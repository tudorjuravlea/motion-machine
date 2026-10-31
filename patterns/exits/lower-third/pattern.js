// exits/lower-third: takes a text/lower-third out the way its mechanism came in: the bar wipes away
// after the text rides back into it, the brackets retract, the plate turns back on its edge, the
// tab folds and slides out, the name un-types, the strip and the pill shrink to their start. The
// entrance has just drawn the lower third on the same seek; this redraws it at 1 - p through the
// same pose function, with the beat's params read exactly as the entrance reads them (its defaults,
// then the brand's style.patterns["text/lower-third"], then the beat's), so the two never disagree.
import lowerThird, { render } from '../../text/lower-third/pattern.js';
import { paramsOf } from '../../../runtime/kit/params.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  name: 'lower-third',
  group: 'exits',
  params: {},
  at(el, p, ctx) {
    if (!(p > 0)) return;
    const prm = paramsOf(lowerThird, ctx.params, ctx.style);
    render(el, prm, 1 - clamp01(p), { leaving: true, ease: (x) => ctx.ease('exit', x) });
  },
};

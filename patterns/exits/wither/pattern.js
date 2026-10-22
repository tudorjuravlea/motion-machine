// exits/wither: a garden grown by text/garden recedes to the bare type. Its growth runs backwards
// over the first 75 % of the exit, so the last-grown parts go first: blossoms close petal by petal
// and leaves fold away (an ease without overshoot), then each stem undraws from its tip to its
// root. With `type: fade` (the default) the bare type then fades over the last 20 %; with
// `type: keep` it stays whole until the kit removes the slot, so the exit's last frame is the bare
// slot. A slot that holds no garden only fades. Pure in p (and in the piece's time, which keeps a
// botanical bed's floating petals on the path they float in at rest): the garden's plan comes from
// the entrance, which the kit draws at rest in the same seek before the exit runs.
import { modelOf, paint } from '../../text/garden/pattern.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const RECEDE = 0.75, FADE = 0.8;

export default {
  name: 'wither',
  group: 'exits',
  params: {
    type: { type: 'enum(fade|keep)', default: 'fade', meaning: 'after the garden has gone, fade the bare type, or keep it whole until the exit ends' },
  },
  at(el, p, ctx) {
    const keep = ctx.params?.type === 'keep';
    const q = clamp01(p);
    const model = el.querySelector(':scope > svg.mm-garden') ? modelOf(el) : null;
    if (model) paint(el, model, 1 - clamp01(q / (keep ? 1 : RECEDE)), { mode: 'wither', time: ctx.t ?? 0 });
    if (keep && model) return;
    // the type: with a garden after it has gone, without one over the whole exit
    const from = model ? FADE : 0;
    const f = clamp01((q - from) / (1 - from));
    el.style.opacity = f <= 0 ? '' : String(Math.round((1 - f) * 1000) / 1000);
  },
};

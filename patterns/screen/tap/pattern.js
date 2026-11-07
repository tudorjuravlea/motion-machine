// screen/tap: a touch on the screen at a mark or a percent point. The ring presses in over the
// first 30 % of the action, then ripples out and fades, gone at p = 1. Its place follows the screen
// state of the same seek (scroll and zoom), so a tap lands on the mark wherever the page is.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const PRESS = 0.3;

export default {
  name: 'tap',
  group: 'screen',
  dur: 'standard',
  params: {
    at: { type: 'string', default: '50%,50%', meaning: 'a mark label from media.json, or "x%,y%" of the screen' },
    ripple: { type: 'boolean', default: true, meaning: 'the ring grows out as it fades after the press' },
  },
  reduce(state) { return state; },
  draw(el, p, ctx) {
    let ring = el.querySelector(':scope > .tap');
    if (!ring) { el.insertAdjacentHTML('beforeend', '<i class="tap"></i>'); ring = el.lastElementChild; }
    const { x, y } = ctx.at(ctx.params.at);
    const press = clamp01(p / PRESS);
    const after = clamp01((p - PRESS) / (1 - PRESS));
    const ripple = ctx.params.ripple !== false && ctx.params.ripple !== 'false';
    const scale = p < PRESS ? 1 - 0.08 * ctx.ease('enter', press) : 0.92 + (ripple ? 1.28 : 0.08) * ctx.ease('exit', after);
    ring.style.left = `${x * 100}%`;
    ring.style.top = `${y * 100}%`;
    ring.style.transform = `translate(-50%, -50%) scale(${Math.round(scale * 1000) / 1000})`;
    ring.style.opacity = String(Math.round((p < PRESS ? press : 1 - after) * 1000) / 1000);
  },
};

// screen/compare: a before-and-after divider on a device screen, like a comparison slider. A
// vertical line enters at the screen's right edge and travels to `stop` (a fraction of the screen's
// width) over the first `move` of the action, then holds; right of the line the `to` asset shows,
// left of it the screen's own content. The revealed asset runs on the action's own clock (seconds
// since it began), so a recording keeps playing under the line through the hold. The state outlives
// the action (paint() draws the line on every seek); the kit's screen paint clips the revealed
// content, and a 3D device copies both into its texture.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export default {
  name: 'compare',
  group: 'screen',
  dur: 'hold',
  params: {
    to: { type: 'string', default: '', meaning: 'the asset revealed right of the line (assets/…; a folder ends in /)' },
    stop: { type: 'number', default: 0.5, meaning: 'where the line stops, as a fraction of the screen width from its left edge (0 to 1)' },
    move: { type: 'number', default: 0.35, meaning: 'the fraction of the action the line spends travelling; it holds for the rest' },
  },
  reduce(state, p, ctx) {
    const to = ctx.params?.to;
    if (!to) return state;
    const stop = clamp01(Number(ctx.params.stop ?? 0.5));
    const move = Math.min(1, Math.max(0.05, Number(ctx.params.move ?? 0.35)));
    const k = ctx.ease('move', clamp01(p / move));
    return { ...state, compare: { to, x: r4(1 - (1 - stop) * k), time: r4(clamp01(p) * (Number(ctx.d) || 0)) } };
  },
  paint(screenEl, state) {
    const fx = screenEl.querySelector('.mm-screen-fx[data-do="screen/compare"]');
    if (!fx) return;
    const c = state.compare;
    if (!c || c.x >= 1) { fx.style.cssText = 'display:none;'; fx.textContent = ''; return; }
    fx.style.cssText = `display:block;--mm-compare-x:${c.x};`;
    fx.dataset.x = String(c.x);
    if (!fx.firstElementChild) fx.innerHTML = '<i class="mm-compare__line"></i><i class="mm-compare__knob"></i>';
  },
};

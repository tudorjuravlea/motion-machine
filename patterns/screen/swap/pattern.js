// screen/swap: the screen moves to another asset (a still, a sequence folder or a captured page),
// as app navigation does: `slide` brings it in from the right, `fade` dissolves, `cut` changes at
// once. At p = 1 the new asset becomes the screen's content, scrolled to its top, so later actions
// scroll, tap and play on it. A swap that starts while another is under way arrives over it, and the
// earlier one keeps its own progress: nothing jumps.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  name: 'swap',
  group: 'screen',
  dur: 'standard',
  params: {
    to: { type: 'string', default: '', meaning: 'the asset to move to (assets/…; a folder ends in /)' },
    how: { type: 'enum', values: ['slide', 'fade', 'cut'], default: 'slide', meaning: 'how the new screen arrives' },
  },
  reduce(state, p, ctx) {
    const to = ctx.params.to;
    if (!to) return state;
    if (p >= 1 || ctx.params.how === 'cut') {
      return { ...state, content: { kind: ctx.kindOf(to), base: to, meta: ctx.metaOf(to) }, scrollY: 0, frameTime: 0, swapping: [] };
    }
    return { ...state, swapping: [...(state.swapping ?? []), { to, p: clamp01(ctx.ease('move', p)), how: ctx.params.how }] };
  },
};

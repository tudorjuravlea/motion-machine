// screen/play: plays the screen's frame sequence (mm media prep) from `from` seconds into the clip
// at `rate`, over the action's duration. The frame shown is the fold's frameTime; past the
// clip's end the last frame holds; before the action starts the frame at `from` holds. Not a
// sequence: the state passes through unchanged.
export default {
  name: 'play',
  group: 'screen',
  dur: 'hold',
  holdsBefore: true,   // the frame at `from` shows until the action starts (the fold)
  params: {
    from: { type: 'number', default: 0, meaning: 'seconds into the clip at p = 0' },
    rate: { type: 'number', default: 1, meaning: 'playback speed (0.5 is half speed)' },
  },
  reduce(state, p, ctx) {
    if (state.content.kind !== 'sequence') return state;
    const from = Math.max(0, Number(ctx.params.from) || 0);
    const rate = Number(ctx.params.rate) > 0 ? Number(ctx.params.rate) : 1;
    return { ...state, frameTime: from + p * ctx.d * rate };
  },
};

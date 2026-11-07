// Capture-reference stub: a push to the left. The incoming scene slides in from the
// right while the outgoing one slides out by the same distance, so the whole picture shifts.
// 0.6 s: the calm column of references/transitions.md (push 0.6 s).
export default {
  name: 'push',
  group: 'transitions',
  params: {},
  dur: 0.6,
  at(to, p, ctx) {
    const q = Math.min(1, Math.max(0, p));
    to.style.translate = q === 1 ? 'none' : `${((1 - q) * 100).toFixed(3)}% 0`;
    if (ctx.from) ctx.from.style.translate = `${(-q * 100).toFixed(3)}% 0`;
  },
};

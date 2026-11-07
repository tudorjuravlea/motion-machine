// screen/scroll: glides a captured page (mm capture site) from wherever the screen is to a mark or
// a css px offset, eased with the style's move curve. `settle` adds a small momentum overshoot near
// the end, bounded by the style's motion.overshootMax and back to the exact target at p = 1. The
// target is clamped to the page, so a page shorter than the screen never moves.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function targetY(state, to, align, box) {
  const meta = state.content.meta;
  const k = box.w / meta.viewport.w;
  const visible = box.h / k;
  const max = Math.max(0, meta.height - visible);
  let y;
  if (typeof to === 'number' || /^-?\d+(\.\d+)?$/.test(String(to))) y = Number(to);
  else {
    const m = meta.marks?.[to];
    if (!m) return { y: Math.min(max, Math.max(0, state.scrollY)), max };   // G-PATTERN-REF names the unknown mark
    y = align === 'center' ? m.y + m.h / 2 - visible / 2 : m.y;
  }
  return { y: Math.min(max, Math.max(0, y)), max };
}

export default {
  name: 'scroll',
  group: 'screen',
  dur: 'slow',
  params: {
    to: { type: 'string', default: '0', meaning: 'a mark label from media.json, or a page offset in css px' },
    align: { type: 'enum', values: ['top', 'center'], default: 'top', meaning: 'where the mark lands on the screen' },
    settle: { type: 'number', default: 0.4, meaning: 'momentum overshoot near the end, 0 to 1, times motion.overshootMax' },
  },
  reduce(state, p, ctx) {
    if (state.content.kind !== 'page') return state;
    const { y: to, max } = targetY(state, ctx.params.to, ctx.params.align, ctx.box);
    const from = state.scrollY;
    const settle = Math.min(1, Math.max(0, Number(ctx.params.settle) || 0));
    const bump = settle * (ctx.style.motion.overshootMax ?? 0) * Math.sin(Math.PI * clamp01((p - 0.55) / 0.45));
    const y = from + (to - from) * (ctx.ease('move', p) + bump);
    return { ...state, scrollY: Math.min(max, Math.max(0, y)) };
  },
};

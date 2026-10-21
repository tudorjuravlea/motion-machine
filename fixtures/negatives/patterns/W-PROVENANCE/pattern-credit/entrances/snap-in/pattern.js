// entrances/snap-in: opacity steps from 0 to 1 at progress `at` (default 0.5). Nothing else moves.
export default {
  name: 'snap-in',
  group: 'entrances',
  params: { at: { type: 'number', default: 0.5, meaning: 'the progress at which the element appears' } },
  at(el, p, ctx) {
    el.style.opacity = p >= Number(ctx.params.at) ? '1' : '0';
  },
};

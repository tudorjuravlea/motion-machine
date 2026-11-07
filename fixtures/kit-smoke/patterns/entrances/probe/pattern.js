// Fixture probe: an entrance that records what the kit hands it (params, unit) so the
// follow-up tests can read it back. Rise by d × ctx.unit × travel.
const rec = (kind, key, v) => { const w = globalThis; w.__probe ??= {}; (w.__probe[kind] ??= {})[key] = v; };
export default {
  name: 'probe',
  group: 'entrances',
  params: { d: { type: 'number', default: 0.25, meaning: 'rise as a multiple of ctx.unit' } },
  at(el, p, ctx) {
    rec('entrance', el.dataset.slot, { params: ctx.params, unit: ctx.unit });
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    el.style.translate = p === 1 ? 'none' : `0 ${((1 - p) * Number(ctx.params.d) * ctx.unit * ctx.style.motion.travel).toFixed(3)}px`;
  },
};

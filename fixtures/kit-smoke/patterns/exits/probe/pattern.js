// Fixture probe: an exit that records its params.
const rec = (kind, key, v) => { const w = globalThis; w.__probe ??= {}; (w.__probe[kind] ??= {})[key] = v; };
export default {
  name: 'probe',
  group: 'exits',
  params: { side: { type: 'enum(left|right)', default: 'right', meaning: 'where it leaves' } },
  at(el, q, ctx) {
    rec('exit', el.dataset.slot, ctx.params);
    el.style.opacity = String(1 - q);
  },
};

// Fixture probe: an emphasis that records its params.
const rec = (kind, key, v) => { const w = globalThis; w.__probe ??= {}; (w.__probe[kind] ??= {})[key] = v; };
export default {
  name: 'probe',
  group: 'emphasis',
  params: { strength: { type: 'number', default: 0.2, meaning: 'how loud' } },
  at(el, q, ctx) {
    rec('emphasis', el.dataset.slot, ctx.params);
    el.style.scale = q > 0 && q < 1 ? String(1 + 0.02 * Math.sin(Math.PI * q)) : 'none';
  },
};

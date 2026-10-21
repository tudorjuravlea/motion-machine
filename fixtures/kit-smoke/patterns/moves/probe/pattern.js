// Fixture probe: a camera move that records p and params per scene.
const rec = (kind, key, v) => { const w = globalThis; w.__probe ??= {}; (w.__probe[kind] ??= {})[key] = v; };
export default {
  name: 'probe',
  group: 'moves',
  params: { k: { type: 'string', default: 'none', meaning: 'a marker' } },
  at(camera, p, ctx) {
    rec('move', ctx.scene, { p, params: ctx.params });
    camera.style.scale = String(1 + 0.04 * p);
  },
};

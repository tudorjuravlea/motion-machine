// Fixture spy (eval fixes): an entrance that records the raw progress the kit hands it, per
// scene/slot, so a test can see whether p ever passes 1. Fades with p, clamped.
export default {
  name: 'spy',
  group: 'entrances',
  params: {},
  at(el, p, ctx) {
    const w = globalThis;
    w.__spy ??= {};
    const key = `${ctx.scene}/${el.dataset.slot}`;
    w.__spy[key] = Math.max(w.__spy[key] ?? -Infinity, p);
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};

// Gate fixture stub (W-SEAM depth axis): grows from small in place, its scale rising from 0.6 to 1 while it fades in. No travel.
export default {
  name: 'grow-in',
  group: 'entrances',
  params: {},
  at(el, p) {
    const q = Math.min(1, Math.max(0, p));
    el.style.opacity = String(q);
    el.style.scale = p === 1 ? 'none' : String((0.6 + q * 0.4).toFixed(4));
  },
};

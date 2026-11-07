// Gate fixture stub (W-SEAM depth axis): settles in place from large, its scale falling from 1.4 to 1 while it fades in. No travel.
export default {
  name: 'settle-in',
  group: 'entrances',
  params: {},
  at(el, p) {
    const q = Math.min(1, Math.max(0, p));
    el.style.opacity = String(q);
    el.style.scale = p === 1 ? 'none' : String((1.4 - q * 0.4).toFixed(4));
  },
};

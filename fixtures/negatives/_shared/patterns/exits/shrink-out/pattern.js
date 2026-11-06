// Gate fixture stub (W-SEAM depth axis): recedes in place, its scale falling from 1 to 0.6 while it fades. No travel.
export default {
  name: 'shrink-out',
  group: 'exits',
  params: {},
  at(el, p) {
    const q = Math.min(1, Math.max(0, p));
    el.style.opacity = String(1 - q * 0.3);
    el.style.scale = String((1 - q * 0.4).toFixed(4));
  },
};

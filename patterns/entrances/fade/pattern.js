// entrances/fade: opacity from 0 to 1. Writes opacity only; nothing is left on the element at rest.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  name: 'fade',
  group: 'entrances',
  dur: 'standard',
  params: {},
  at(el, p) {
    el.style.opacity = p >= 1 ? '' : String(clamp01(p));
  },
};

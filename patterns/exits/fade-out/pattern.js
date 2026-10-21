// exits/fade-out: opacity from 1 to 0 over the exit. The kit hides the element when the exit
// completes; an exit never staggers and takes exitRatio of its entrance (SPEC section 15).
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  name: 'fade-out',
  group: 'exits',
  params: {},
  at(el, p) {
    el.style.opacity = p <= 0 ? '' : String(1 - clamp01(p));
  },
};

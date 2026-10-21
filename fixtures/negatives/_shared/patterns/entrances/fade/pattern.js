// Gate fixture stub (copied from fixtures/kit-smoke): the smallest entrance satisfying the SPEC §5 module contract.
export default {
  name: 'fade',
  group: 'entrances',
  params: {},
  at(el, p) {
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};

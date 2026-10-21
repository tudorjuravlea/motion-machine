// Gate fixture stub: the incoming scene fades in over the outgoing one in the quick role.
export default {
  name: 'crossfade',
  group: 'transitions',
  params: {},
  dur: 'quick',
  at(to, p) {
    to.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};

// Capture-reference stub: a dissolve. The incoming scene sits above the outgoing one
// (DOM order), so its opacity alone blends the two. 0.8 s: the calm column of
// references/transitions.md (crossfade 0.6-1.0 s).
export default {
  name: 'crossfade',
  group: 'transitions',
  params: {},
  dur: 0.8,
  at(to, p) {
    to.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};

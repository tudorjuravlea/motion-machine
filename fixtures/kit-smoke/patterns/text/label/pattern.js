// Fixture stub: a text pattern whose markup comes from pattern.html (fragment: true);
// at() only animates the instantiated fragment.
export default {
  name: 'label',
  group: 'text',
  fragment: true,
  params: { tone: { type: 'string', default: '', meaning: 'second line, filled into data-slot="tone"' } },
  at(el, p) {
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};

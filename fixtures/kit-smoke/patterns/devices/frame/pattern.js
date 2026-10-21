// Fixture stub: a device whose shell comes from pattern.html (fragment: true); the kit
// fills the screen with the beat's text, the value part with its value and the <img> with its asset.
export default {
  name: 'frame',
  group: 'devices',
  fragment: true,
  params: {},
  at(el, p) {
    const root = el.querySelector(':scope > [data-device]');
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    root.style.translate = p === 1 ? 'none' : `0 ${((1 - p) * 40).toFixed(3)}px`;
  },
};

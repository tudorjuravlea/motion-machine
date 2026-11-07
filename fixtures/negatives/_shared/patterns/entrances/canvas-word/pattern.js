// Gate fixture stub: an entrance whose module declares `canvasText: true`, so G-LEGIBLE lets
// its canvas text through (the pattern, not the piece, answers for what it draws). It fades the slot
// in and draws an empty string on a small canvas of its own.
export default {
  name: 'canvas-word',
  group: 'entrances',
  params: {},
  canvasText: true,
  at(el, p) {
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    let c = el.querySelector(':scope > canvas');
    if (!c) { c = el.ownerDocument.createElement('canvas'); c.width = 8; c.height = 8; el.append(c); }
    const g = c.getContext('2d');
    g.clearRect(0, 0, 8, 8);
    g.fillText('', 0, 8);
  },
};

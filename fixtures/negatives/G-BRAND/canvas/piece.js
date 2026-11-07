// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-BRAND/canvas: canvas used to be masked from the pixel test. A canvas no pattern
// declares as media is now measured like any other pixels.
export function after() {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 24; c.dataset.keep = '';
  Object.assign(c.style, { position: 'absolute', left: '0', bottom: '0' });
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(0, 128, 255)';
  g.fillRect(0, 0, 240, 24);
  document.querySelector('[data-scene="style"] .title-stack').append(c);
}

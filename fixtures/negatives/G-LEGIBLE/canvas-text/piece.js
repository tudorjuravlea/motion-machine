// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-LEGIBLE/canvas-text: words painted on a canvas in the palette's ink and the style's
// face; the text walk cannot read them. The static grep sees no API name; the recorder sees the call.
export function after() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 56; c.dataset.keep = '';
  Object.assign(c.style, { position: 'absolute', left: '0', bottom: '0' });
  const g = c.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  g.font = `40px ${css.getPropertyValue('--mm-font-text')}`;
  g.fillStyle = css.getPropertyValue('--mm-color-ink').trim();
  g['fill' + 'Text']('Seen by no rule', 0, 44);
  document.querySelector('[data-scene="style"] .title-stack').append(c);
}

// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after() {
  const img = document.createElement('img');
  img.src = new URL('assets/blank.svg', import.meta.url).href;
  img.dataset.keep = '';
  Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  document.querySelector('[data-scene="style"] .title-stack').append(img);
  return img.decode();
}

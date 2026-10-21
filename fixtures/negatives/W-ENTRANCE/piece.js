// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after() {
  const bar = document.createElement('div');
  bar.className = 'mark';
  document.querySelector('[data-scene="style"] .title-stack').append(bar);
}

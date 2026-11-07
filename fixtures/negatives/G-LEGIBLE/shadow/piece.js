// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-LEGIBLE/shadow: a closed shadow root would hide its text from every text rule.
// The recorder refuses attachShadow however it is reached.
export function after() {
  const host = document.querySelector('[data-scene="style"] .title-stack');
  const root = host['attach' + 'Shadow']({ mode: 'closed' });
  root.innerHTML = '<slot></slot><span style="font-size:12px">TODO lorem ipsum</span>';
}

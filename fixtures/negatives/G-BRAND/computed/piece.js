// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-BRAND/computed: script paints a sub line in a colour that is no palette role.
export function after() {
  document.querySelector('[data-scene="style"] .title-stack').style.setProperty('--mm-color-muted', `rgb(${[46, 110, 160].join(', ')})`);
}

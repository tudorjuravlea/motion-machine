// Piece code for a gate fixture. after(mm) runs once, right after mount.
// A transition that survives render mode: injected at run time, more specific than the kit's reset.
export function after() {
  const css = document.createElement('style');
  css.textContent = '[data-slot="headline"] { transition: opacity var(--mm-dur-standard) !important; }';
  document.head.append(css);
}

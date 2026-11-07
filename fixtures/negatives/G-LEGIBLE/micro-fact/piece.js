// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after() {
  document.querySelector('[data-scene="open"] [data-slot="sub"]').setAttribute('data-micro', '');
}

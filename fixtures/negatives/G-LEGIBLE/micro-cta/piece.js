// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after() {
  document.querySelector('[data-scene="close"] [data-slot="sub"]').setAttribute('data-micro', '');
}

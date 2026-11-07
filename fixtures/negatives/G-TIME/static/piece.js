// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after() {
  setTimeout(() => { document.documentElement.dataset.ready = '1'; }, 0);
}

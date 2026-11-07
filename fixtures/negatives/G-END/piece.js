// Piece code for a gate fixture. after(mm) runs once, right after mount.
export function after(mm) {
  const last = document.querySelector('[data-scene="end"] [data-slot="sub"]');
  const goto = mm.goto;
  mm.goto = (n) => { goto(n); if (n > mm.presses) last.textContent = 'Thanks for watching.'; };
}

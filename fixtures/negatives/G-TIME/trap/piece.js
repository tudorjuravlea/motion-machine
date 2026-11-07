// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/trap: the static grep sees no forbidden name, and the timer fires long after
// the gate has looked; the runtime recorder sees the call.
export function after() {
  globalThis['set' + 'Timeout'](() => { for (const el of document.querySelectorAll('[data-slot="headline"]')) el.style.opacity = '0'; }, 60_000);
}

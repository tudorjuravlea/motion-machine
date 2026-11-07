// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/entropy: timeOrigin differs on every load; a frame built from it is not
// a function of t. The recorder wraps the getter.
export function after() {
  const ent = Math.floor(performance['time' + 'Origin'] * 1000) % 31;
  document.documentElement.style.setProperty('--jitter', String(ent));
}

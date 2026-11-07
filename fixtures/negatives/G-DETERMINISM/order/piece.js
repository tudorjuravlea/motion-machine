// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-DETERMINISM/order: the fourth scene's layout remembers the previous seek, so a frame
// depends on what was drawn before it (state surviving between calls, SPEC §2.2). Two fresh loads
// that render the same instants in the same order agree; rendering them in reverse does not.
export function after(mm) {
  const seek = mm.seek;
  let prev = 0;
  mm.seek = (t) => {
    seek(t);
    document.querySelector('[data-scene="sizes"] .title-stack').style.translate = `${Math.min(8, Math.abs(t - prev)).toFixed(3)}px 0`;
    prev = t;
  };
}

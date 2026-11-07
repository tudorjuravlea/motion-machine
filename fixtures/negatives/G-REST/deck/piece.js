// Piece code for a gate fixture. after(mm) runs once, right after mount.
// A deck whose second rest is drawn half way through its press: seeking to rest 2 lands at 1.5, so
// the sub line of press 2 is mid-entrance where the deck should be a finished picture.
export function after(mm) {
  const seek = mm.seek.bind(mm);
  mm.seek = (x) => seek(x === 2 ? 1.5 : x);
}

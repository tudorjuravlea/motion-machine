// Seeded randomness (SPEC §2.4): the only randomness a piece or pattern may use. Pure: the same
// seed yields the same sequence in every page load.

// 32-bit string hash (FNV-1a), for seeding from a selector or a name.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// random(seed) → next(): a float in [0, 1). A Weyl sequence (golden-ratio increment) passed
// through a 32-bit avalanche finaliser; the counter is the only state and lives in the closure.
export function random(seed = 0) {
  let s = (typeof seed === 'string' ? hash(seed) : seed >>> 0) || 0x2545f491;
  return function next() {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    return (z >>> 0) / 4294967296;
  };
}

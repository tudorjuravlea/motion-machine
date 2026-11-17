// "Did you mean": the nearest known name to one the story misspelt (a pattern, a cue, a param). A name
// within a third of its length in edits (at least one), or the same name in another group, or a common
// alias, is suggested; anything farther is not, so a suggestion is a likely typo and never a guess.

/** Edits (insert, delete, change, swap two neighbours) between two strings. */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

/** Names people reach for that the library spells otherwise. */
export const ALIASES = {
  'fade-in': 'entrances/fade', 'fadein': 'entrances/fade', 'slide-up': 'entrances/rise', 'slide-in': 'entrances/rise',
  'typewriter-in': 'entrances/typewriter', 'cut': 'transitions/hard-cut', 'hardcut': 'transitions/hard-cut',
  'cross-fade': 'transitions/crossfade', 'zoom-in': 'moves/push-in', 'zoom': 'moves/push-in', 'pulse': 'emphasis/indicate',
  'highlight': 'emphasis/indicate', 'circle': 'emphasis/marker-circle', 'stamp-in': 'emphasis/stamp',
};

/**
 * The nearest of `known` to `name`, or null. A `group/name` reference also matches its name alone
 * against each candidate's name (a pattern looked for in the wrong group). An alias wins when its target
 * is known.
 */
export function didYouMean(name, known, aliases = ALIASES) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  const tail = (s) => s.slice(s.lastIndexOf('/') + 1);
  const alias = aliases[n] ?? aliases[tail(n)];
  if (alias && known.includes(alias)) return alias;
  let best = null, bestD = Infinity;
  for (const k of known) {
    const kl = k.toLowerCase();
    const dist = Math.min(editDistance(n, kl), n.includes('/') ? Infinity : editDistance(n, tail(kl)), tail(n) === tail(kl) ? 0.5 : Infinity);
    if (dist < bestD) { best = k; bestD = dist; }
  }
  const limit = Math.max(1, Math.floor(n.length / 3));
  return bestD <= limit && bestD > 0 ? best : null;
}

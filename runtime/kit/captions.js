// Caption groups: where a run of words is cut into the groups a caption shows one at a time.
// `countGroups` is the plain way (runs of a fixed number of words); `captionGroups` chooses the break
// points by a score instead, so a group ends where a reader would breathe. Pure, no DOM.
//
// A break between two words scores by what sits there, the best that applies:
//   a sentence end (. ! ? …)                       SENTENCE (1)
//   strong punctuation (, ; : a dash)              STRONG   (0.7)
//   a pause in the speech of PAUSE_WEAK_S (0.15 s) to PAUSE_STRONG_S (0.4 s) or more
//                                                  from PAUSE_LOW (0.3) up to PAUSE_HIGH (0.5)
//   a phrase boundary (the next word opens a clause or a phrase: and, but, because, with, the…)
//                                                  PHRASE   (0.2)
// and a group that ends on a word that wants the next one (the, of, and, to…) with no punctuation after it
// is charged DANGLING (0.6). The groups are the partition of the words with the lowest total of
//   WEIGHT_SIZE x ((words - target) / target)^2 per group  -  the score of each break  +  the dangling charge
// where target is the words per group asked for (2 to 6). Every group holds MIN_WORDS (2) to MAX_WORDS (6)
// words, so one word is never left alone on a line, and a group's width in characters, wide scripts
// (Chinese, Japanese, Korean, emoji) counted as two, stays within `chars` whenever any partition can.

export const MIN_WORDS = 2;
export const MAX_WORDS = 6;
export const BREAK_SCORE = Object.freeze({ sentence: 1, strong: 0.7, pauseLow: 0.3, pauseHigh: 0.5, phrase: 0.2 });
export const PAUSE_WEAK_S = 0.15;
export const PAUSE_STRONG_S = 0.4;
export const DANGLING = 0.6;
export const WEIGHT_SIZE = 1.5;

/** A word without case, punctuation or diacritics ("Și," is "si"). */
const fold = (text) => String(text).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function folded(list) { return new Set(list.map(fold)); }

const SENTENCE_END = /[.!?…。！？]["'”’)\]»」』]*$/u;
const STRONG_END = /[,;:—–、，；：]["'”’)\]»」』]*$/u;
// words that open a clause or a phrase (a break before them is a phrase boundary), English and Romanian
const OPENS = folded(['and', 'but', 'or', 'so', 'because', 'that', 'which', 'who', 'when', 'while', 'if', 'then', 'with', 'for', 'from', 'in', 'on', 'at', 'to', 'of', 'by', 'as', 'the', 'a', 'an',
  'și', 'dar', 'sau', 'că', 'care', 'când', 'dacă', 'cu', 'pentru', 'din', 'în', 'pe', 'la', 'de', 'un', 'o']);
// words that want the next word to stay with them: a group does not end on one
const WANTS_NEXT = folded(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'but', 'with', 'for', 'in', 'on', 'at', 'by', 'from', 'as', 'that', 'is', 'are', 'was', 'be', 'my', 'your', 'our', 'their', 'this',
  'și', 'sau', 'dar', 'de', 'la', 'în', 'pe', 'cu', 'din', 'pentru', 'un', 'o', 'că']);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const textOf = (item) => (typeof item === 'string' ? item : String(item.text));
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** Width of a text in character units: a wide character (CJK, Hangul, fullwidth, emoji) is 2, any other 1. */
export function charWidth(text) {
  let n = 0;
  for (const ch of String(text)) n += WIDE.test(ch) ? 2 : 1;
  return n;
}

/** Width of words set on one line: their widths, and a space between two unless both sides are wide characters (those scripts set no spaces). */
export function lineWidth(texts) {
  let n = 0;
  texts.forEach((t, i) => {
    n += charWidth(t);
    if (i) { const a = [...String(texts[i - 1])].at(-1), b = [...String(t)][0]; if (!(WIDE.test(a) && WIDE.test(b))) n += 1; }
  });
  return n;
}

/** Runs of `size` items; a one-item tail joins the run before it. The plain way, and the one a brand can ask for (`breaks: count`). */
export function countGroups(list, size) {
  const groups = [];
  for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(groups.pop()[0]);
  return groups;
}

/**
 * How good a place to break between `prev` and `next` (words as strings or { text, at, end }): 0 to 1.
 * The pause counts when both carry times (a pause longer than PAUSE_STRONG_S scores PAUSE_HIGH).
 */
export function breakScore(prev, next) {
  const a = textOf(prev).trim();
  if (SENTENCE_END.test(a)) return BREAK_SCORE.sentence;
  if (STRONG_END.test(a)) return BREAK_SCORE.strong;
  let best = OPENS.has(fold(textOf(next))) ? BREAK_SCORE.phrase : 0;
  if (typeof prev === 'object' && typeof next === 'object' && Number.isFinite(prev.end) && Number.isFinite(next.at)) {
    const gap = Math.round((next.at - prev.end) * 1000) / 1000;
    if (gap >= PAUSE_WEAK_S) best = Math.max(best, BREAK_SCORE.pauseLow + (BREAK_SCORE.pauseHigh - BREAK_SCORE.pauseLow) * clamp01((gap - PAUSE_WEAK_S) / (PAUSE_STRONG_S - PAUSE_WEAK_S)));
  }
  return best;
}

const dangles = (item) => { const t = textOf(item).trim(); return !SENTENCE_END.test(t) && !STRONG_END.test(t) && WANTS_NEXT.has(fold(t)); };

function partition(items, target, chars) {
  const n = items.length, texts = items.map(textOf);
  const rate = Array.from({ length: n - 1 }, (_, i) => breakScore(items[i], items[i + 1]));
  const best = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(-1);
  best[0] = 0;
  for (let i = MIN_WORDS; i <= n; i++) {
    for (let size = MIN_WORDS; size <= MAX_WORDS && size <= i; size++) {
      const j = i - size;
      if (!(best[j] < Infinity)) continue;
      if (size > 1 && lineWidth(texts.slice(j, i)) > chars) continue;
      const last = i === n;
      const cost = best[j] + WEIGHT_SIZE * ((size - target) / target) ** 2 + (last ? 0 : (dangles(items[i - 1]) ? DANGLING : 0) - rate[i - 1]);
      if (cost < best[i] - 1e-12) { best[i] = cost; from[i] = j; }
    }
  }
  if (!(best[n] < Infinity)) return null;
  const cuts = [];
  for (let i = n; i > 0; i = from[i]) cuts.unshift(from[i]);
  return cuts.map((s, k) => items.slice(s, cuts[k + 1] ?? n));
}

const memo = new WeakMap();

/**
 * Groups of a word list, the breaks chosen by score (see the top of this file). `items` are strings or
 * { text, at, end } (seconds, for the pauses); `group` the words per group asked for (2 to 6, default 4);
 * `chars` the width of a group in character units (default 30). With fewer than two words there is one group
 * of what there is; a list no partition of 2 to 6 words can hold within `chars` is grouped as if `chars`
 * were unlimited. An array of items is grouped once per (group, chars) and the result reused.
 */
export function captionGroups(items, { group = 4, chars = 30 } = {}) {
  const asked = Math.round(Number(group));
  const target = Math.min(MAX_WORDS, Math.max(MIN_WORDS, Number.isFinite(asked) ? asked : 4));
  const limit = Number(chars) > 0 ? Number(chars) : Infinity;
  if (items.length < MIN_WORDS) return items.length ? [[...items]] : [];
  let byKey = memo.get(items);
  if (!byKey) memo.set(items, (byKey = new Map()));
  const key = `${target}|${limit}`;
  if (!byKey.has(key)) byKey.set(key, partition(items, target, limit) ?? partition(items, target, Infinity));
  return byKey.get(key);
}

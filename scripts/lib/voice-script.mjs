// The round trip for a generated voice (SPEC §8, W-VOICE-SCRIPT): the words a transcriber heard in the voice's audio
// against the words the voice was sent. Pure; no file, no network.
//
//   tokens(text)               the words of a text as the comparison reads them: no case, punctuation or diacritics,
//                              a number in digits written as its word (0-20 and the round tens)
//   compareScript(script, said) { wer, said, meant, missing, extra, changed, numbers, ops } for the script text and the
//                              heard words ([{ text }] or strings)
import { normWord } from './footage-words.mjs';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = { 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'hundred' };
const NUMBER_WORDS = new Set([...ONES, ...Object.values(TENS)]);
const asWord = (digits) => { const n = Number(digits); return Number.isInteger(n) ? (ONES[n] ?? TENS[n] ?? digits) : digits; };

/** True for a token that is a number: digits, or a number word the comparison knows. */
export const isNumberToken = (t) => /\d/.test(t) || NUMBER_WORDS.has(t);

/** The words of a text, normalised: "3" and "three" are one token, "Don't," is "dont", "twenty-one" is two. */
export function tokens(text) {
  const out = [];
  for (const chunk of String(text ?? '').split(/[\s\-‐-―/]+/)) {
    // a figure ("3", "3.5", "1,000", "$3," once its edges are trimmed) is one token, digits as a word where cheap; any other chunk is a word
    const num = chunk.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const t = /^\d+$/.test(num) ? asWord(num) : /^\d[\d.,]*\d$/.test(num) ? num.replace(/,/g, '') : /\d/.test(num) ? num.toLowerCase().replace(/,/g, '') : normWord(chunk);
    if (t) out.push(t);
  }
  return out;
}

/** Word-level edit distance with a backtrace: a list of { op: 'ok' | 'sub' | 'del' | 'ins', meant, said } in order. */
function align(ref, hyp) {
  const R = ref.length, H = hyp.length;
  const d = Array.from({ length: R + 1 }, (_, i) => Array.from({ length: H + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= R; i++) for (let j = 1; j <= H; j++) {
    d[i][j] = Math.min(d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
  }
  const ops = [];
  let i = R, j = H;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      ops.push(ref[i - 1] === hyp[j - 1] ? { op: 'ok', meant: ref[i - 1], said: hyp[j - 1] } : { op: 'sub', meant: ref[i - 1], said: hyp[j - 1] });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'del', meant: ref[i - 1] }); i--; } else { ops.push({ op: 'ins', said: hyp[j - 1] }); j--; }
  }
  return ops.reverse();
}

/**
 * The script a voice was sent against the words heard in its audio. `wer` is (changed + missing + extra) over the
 * script's words (0 for two empty texts, 1 for a script heard as nothing or nothing heard as a script).
 * `numbers` are the changes where either side is a number: a figure said wrong is worse than a word said wrong.
 */
export function compareScript(script, said) {
  const meant = tokens(script);
  const heard = tokens(said.map((w) => (typeof w === 'string' ? w : w.text)).join(' '));
  const ops = align(meant, heard);
  const missing = ops.filter((o) => o.op === 'del').map((o) => o.meant);
  const extra = ops.filter((o) => o.op === 'ins').map((o) => o.said);
  const changed = ops.filter((o) => o.op === 'sub').map((o) => ({ meant: o.meant, said: o.said }));
  const errors = missing.length + extra.length + changed.length;
  const wer = meant.length ? errors / meant.length : heard.length ? 1 : 0;
  const numbers = changed.filter((c) => isNumberToken(c.meant) || isNumberToken(c.said));
  return { wer, words: meant.length, errors, missing, extra, changed, numbers, ops: ops.filter((o) => o.op !== 'ok') };
}

// The round-trip check of `mm footage verify`: the words the plan puts either side of each cut, against the
// words heard in the finished edit. A cut can clip a word's onset or tail, or leave a word the plan removed;
// the plan's words (edit.json, on the output clock) are matched to the heard ones by folded text and time.
import { normWord } from './footage-words.mjs';

/** Planned words checked on each side of a cut. */
export const VERIFY_WORDS = 3;
/** A heard word counts for a planned one when it starts within this many seconds of it. */
export const VERIFY_TOLERANCE_S = 0.6;
/** Frames either side of a cut in its strip. */
export const STRIP_FRAMES = 10;

const MIN_FRAGMENT = 2;
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * One cut at output second `at`: { at, checked, missing, clipped, extra }.
 * `plan`: [{ text, at, end }] on the output clock; `heard`: [{ text, start, end }] of the finished edit.
 * missing: planned, nothing like it heard there. clipped: only a piece of it heard (a cut took its onset or tail).
 * extra: heard near the cut, matching nothing planned (a word the plan removed, still audible).
 */
export function compareCut(plan, heard, at) {
  const before = plan.filter((w) => w.end <= at + 0.05).slice(-VERIFY_WORDS);
  const after = plan.filter((w) => w.at >= at - 0.05).slice(0, VERIFY_WORDS);
  const planned = [...before, ...after].filter((w, i, a) => a.indexOf(w) === i);
  const lo = Math.min(at, ...planned.map((w) => w.at)) - VERIFY_TOLERANCE_S, hi = Math.max(at, ...planned.map((w) => w.end)) + VERIFY_TOLERANCE_S;
  const near = heard.filter((h) => h.end >= lo && h.start <= hi);
  const used = new Set();
  const missing = [], clipped = [];
  for (const p of planned) {
    const want = normWord(p.text);
    if (!want) continue;
    const close = near.filter((h) => !used.has(h) && Math.abs(h.start - p.at) <= VERIFY_TOLERANCE_S);
    const exact = close.find((h) => normWord(h.text) === want);
    if (exact) { used.add(exact); continue; }
    const piece = close.find((h) => { const g = normWord(h.text); return g.length >= MIN_FRAGMENT && g.length < want.length && (want.startsWith(g) || want.endsWith(g)); });
    if (piece) { used.add(piece); clipped.push({ word: p.text, heard: piece.text, at: r3(p.at) }); } else missing.push({ word: p.text, at: r3(p.at) });
  }
  const extra = near.filter((h) => !used.has(h) && normWord(h.text) && h.start >= at - VERIFY_TOLERANCE_S && h.start <= at + VERIFY_TOLERANCE_S)
    .map((h) => ({ word: h.text, at: r3(h.start) }));
  return { at: r3(at), checked: planned.length, missing, clipped, extra };
}

/** Every cut of the plan: { cuts: [...compareCut], ok } (ok: nothing clipped or missing; an extra word is a note). */
export function verifyEdit(plan, heard) {
  const cuts = plan.cuts.map((c) => compareCut(plan.words, heard, c.at));
  return { cuts, ok: cuts.every((c) => !c.missing.length && !c.clipped.length) };
}

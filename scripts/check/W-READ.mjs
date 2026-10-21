// W-READ (SPEC §7, §12, provisional 0.3 s per word from motion-media practice): a film scene's
// words × 0.3 s plus its last arrival must fit in the scene's duration. Each line must also hold
// settled long enough to read (brag, MIT, restated): a label of 1-3 words 0.8 s, a longer line
// 0.3 s per word and at least 1.2 s, from the end of its entrance to its exit or its scene's end.
import { rule } from '../lib/rule.mjs';
import { EPS, round, words } from './_pure.mjs';

export const PER_WORD_S = 0.3;
export const LABEL_S = 0.8, SENTENCE_S = 1.2;

/** Seconds a line of `n` words must stay settled on screen. */
export const lineFloor = (n) => (n <= 3 ? LABEL_S : Math.max(SENTENCE_S, round(n * PER_WORD_S, 2)));

/** The first half for one scene of the resolved story: its words, its last arrival, and words × 0.3 s plus that arrival. */
export function sceneNeed(sc) {
  const n = sc.beats.reduce((a, b) => a + words(b.text), 0);
  const lastAt = Math.max(0, ...sc.beats.map((b) => b.at));
  return { words: n, lastAt, need: n * PER_WORD_S + lastAt };
}

/** Where a scheduled line stops being readable: its exit's start, else its scene's end (undefined when the scene is not scheduled). */
export const lineEnd = (it, schedule) => (it.exit ? it.exit.start : schedule.scenes.find((sc) => sc.id === it.scene)?.end);

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-READ', 'SKIP', { reason: 'deck presses are paced by the presenter, not by a duration' });
  const tight = [];
  for (const sc of ctx.story.scenes) {
    const { words: n, need } = sceneNeed(sc);
    if (need > sc.duration + EPS) tight.push({ selector: `[data-scene="${sc.id}"]`, measured: round(need, 2), threshold: sc.duration, words: n });
  }
  if (tight.length) return rule('W-READ', 'WARN', { ...tight[0], reason: `scene needs ${tight[0].measured}s to read (${tight[0].words} words) but lasts ${tight[0].threshold}s`, all: tight });
  const brief = [];
  for (const it of ctx.schedule.items ?? []) {
    const n = words(it.beat?.text);
    if (!n || it.parent) continue;
    const end = lineEnd(it, ctx.schedule);
    if (end == null) continue;
    const settled = end - (it.start + it.d), floor = lineFloor(n);
    if (!it.exit && settled <= EPS) continue;   // still arriving when its scene ends: G-REST's defect, not a second one here
    if (settled < floor - EPS) brief.push({ kind: 'line', selector: it.selector, measured: round(Math.max(0, settled), 2), threshold: floor, words: n });
  }
  if (brief.length) return rule('W-READ', 'WARN', { ...brief[0], reason: `a ${brief[0].words}-word line holds ${brief[0].measured}s settled; it needs ${brief[0].threshold}s`, all: brief });
  return rule('W-READ', 'PASS', { perWord: PER_WORD_S, label: LABEL_S, sentence: SENTENCE_S });
}

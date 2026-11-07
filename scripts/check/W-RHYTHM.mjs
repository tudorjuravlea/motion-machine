// W-RHYTHM (SPEC §7, provisional): scene lengths too even. From four scenes, the
// longest scene over the shortest under 1.5 warns: a film whose scenes all last the same reads as a metronome.
// Read from the schedule. A style's `gate.rhythmRatio` sets the ratio. A deck is SKIP (its pace is the presenter's).
import { rule } from '../lib/rule.mjs';
import { round } from './_pure.mjs';

export const RATIO = 1.5;
export const MIN_SCENES = 4;

export default async function (ctx) {
  if (ctx.schedule.kind === 'deck') return rule('W-RHYTHM', 'SKIP', { reason: 'a deck waits on the presenter; scene length is a film rule' });
  const scenes = ctx.schedule.scenes;
  if (scenes.length < MIN_SCENES) return rule('W-RHYTHM', 'SKIP', { reason: `${scenes.length} scenes: the rhythm of scene lengths needs at least ${MIN_SCENES}` });
  const limit = ctx.style?.gate?.rhythmRatio ?? RATIO;
  const lengths = scenes.map((sc) => sc.end - sc.start);
  const longest = Math.max(...lengths), shortest = Math.min(...lengths);
  if (!(shortest > 0)) return rule('W-RHYTHM', 'SKIP', { reason: 'a scene has no length' });
  const ratio = round(longest / shortest, 2);
  const evidence = { measured: ratio, threshold: limit, scenes: scenes.length, longestS: round(longest, 2), shortestS: round(shortest, 2) };
  if (ratio < limit) return rule('W-RHYTHM', 'WARN', { ...evidence, reason: `the longest scene is ${ratio} times the shortest (${round(longest, 2)} s against ${round(shortest, 2)} s) across ${scenes.length} scenes; vary them to at least ${limit}` });
  return rule('W-RHYTHM', 'PASS', evidence);
}

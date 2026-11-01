// W-DECK-STEP (SPEC §7, provisional): a deck beat is stepped but no press reaches it, or two steps share an id.
//   step    a beat's `step` is past the scene's presses (the kit plays it on the last press, which is not the press it says)
//   exit    a beat's `until` is at or before its own arrival (it never shows) or past the scene's presses (the exit never plays)
//   screen  a screen action's `step` lands past the scene's presses (the kit plays it on the last press)
//   id      two beats of one scene drive the same slot: one id, one element, and the later beat overwrites the earlier
// A step is a beat's `step` (default 1; 0 is present at the scene's first rest and needs no press); its id is the scene and the slot.
// Reads the resolved story, no page. A film has no presses: SKIP. A warning never blocks; the fix is the story's.
import { rule } from '../lib/rule.mjs';

const ID = 'W-DECK-STEP';

/** The findings of a deck story: [{ kind: 'step' | 'exit' | 'screen' | 'id', scene, slot, step?, until?, presses?, reason }]; [] for a film. */
export function findings(story) {
  if (story?.kind !== 'deck') return [];
  const out = [];
  for (const sc of story.scenes ?? []) {
    const presses = sc.presses ?? 1, seen = new Map();
    for (const b of sc.beats ?? []) {
      const step = b.step ?? 1, at = `${sc.id} (${presses} press${presses === 1 ? '' : 'es'})`;
      if (step > presses) out.push({ kind: 'step', scene: sc.id, slot: b.slot, step, presses, reason: `${at}: ${b.slot} is stepped at press ${step}, and no press reaches it` });
      if (b.until != null && (b.until > presses || b.until <= step)) {
        out.push({ kind: 'exit', scene: sc.id, slot: b.slot, step, until: b.until, presses, reason: `${at}: ${b.slot} leaves at press ${b.until}, ${b.until > presses ? 'which the scene does not have' : `at or before the press it arrives on (${step})`}` });
      }
      for (const a of b.screen ?? []) {
        if (step + (a.step ?? 0) > presses) out.push({ kind: 'screen', scene: sc.id, slot: b.slot, step: step + (a.step ?? 0), presses, reason: `${at}: ${b.slot}'s ${a.do} is stepped at press ${step + (a.step ?? 0)}, and no press reaches it` });
      }
      seen.set(b.slot, (seen.get(b.slot) ?? 0) + 1);
    }
    for (const [slot, n] of seen) if (n > 1) out.push({ kind: 'id', scene: sc.id, slot, reason: `${sc.id}: ${n} beats drive the slot ${slot}, so they share one id and one element` });
  }
  return out;
}

export const scope = 'piece';

export default async function (ctx) {
  if (ctx.story.kind !== 'deck') return rule(ID, 'SKIP', { reason: 'a film has no presses to step through' });
  const problems = findings(ctx.story);
  if (problems.length) return rule(ID, 'WARN', { reason: `${problems[0].reason}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`, selector: `[data-scene="${problems[0].scene}"] [data-slot="${problems[0].slot}"]`, measured: problems.length, problems });
  return rule(ID, 'PASS', { measured: 0, scenes: ctx.story.scenes.length });
}

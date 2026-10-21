// W-SCENE-END (SPEC §7): a film scene's last instant with an element still mid-progress. Motion carried
// into a cut (a match cut, a whip) is a technique, so this advises and never fails; W-HOLD says the same
// defect from the other side (a scene still arriving at its end has a rest of 0 s). The frame-sampling
// hard rules read such a scene at that same last instant, so advising here does not leave it unread. A deck has rests, not
// scene ends: G-REST covers it. Reads the kit's report().
import { rule } from '../lib/report.mjs';
import { firstMidEntrance, sceneEndProbes } from './_rest.mjs';

export const scope = 'format';

export default async function (ctx) {
  if (ctx.schedule.kind === 'deck') return rule('W-SCENE-END', 'SKIP', { reason: 'a deck has rests, not scene ends; G-REST covers them' });
  const probes = sceneEndProbes(ctx.schedule);
  const mid = await firstMidEntrance(ctx, probes);
  if (mid) return rule('W-SCENE-END', 'WARN', { instant: mid.t, selector: mid.selector, measured: mid.progress, reason: `mid-entrance at the end of scene ${mid.scene}` });
  return rule('W-SCENE-END', 'PASS', { instants: probes.length });
}

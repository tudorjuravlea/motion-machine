// W-CUE's verdict, pure (SPEC §7, §9), so it runs in a browser (the studio). `getGrid()` returns
// the beat grid as scripts/sound.mjs loadGrid gives it ({ beats: number[] | null, declared,
// missing?: audio.beats as written }); it is called only once the schedule has cues, as the rule always read it.
// W-CUE.mjs (mm check) passes a grid read from disk; timing.mjs passes ctx.grid.
import { rule } from '../lib/rule.mjs';
import { DRIFT_S, cueEvents, nearest } from '../lib/cues.mjs';

export function cueVerdict(schedule, getGrid) {
  if (schedule?.kind === 'deck') return rule('W-CUE', 'SKIP', { reason: 'deck cues sit on presses, not on a clock with a beat grid' });
  const cues = cueEvents(schedule);
  if (!cues.length) return rule('W-CUE', 'SKIP', { reason: 'the schedule has no cues' });
  const grid = getGrid();
  if (grid.missing) return rule('W-CUE', 'WARN', { reason: `audio.beats names a file that does not exist: ${grid.missing}`, file: grid.missing });
  if (!grid.beats) return rule('W-CUE', 'SKIP', { reason: 'no beat grid (audio.beats is null): cues are not snapped' });
  const rows = cues.filter((c) => c.name !== 'bed').map((c) => {
    const b = nearest(grid.beats, c.t);
    return { cue: c.name, selector: c.selector, instant: c.t, nearestBeat: b, driftMs: Math.round((b - c.t) * 1000) };
  });
  const bad = rows.filter((r) => Math.abs(r.driftMs) > DRIFT_S * 1000 + 1e-9);
  if (!bad.length) return rule('W-CUE', 'PASS', { measured: Math.max(0, ...rows.map((r) => Math.abs(r.driftMs))), threshold: DRIFT_S * 1000 });
  const w = bad.reduce((a, r) => (Math.abs(r.driftMs) > Math.abs(a.driftMs) ? r : a));
  return rule('W-CUE', 'WARN', {
    selector: w.selector, instant: w.instant, measured: Math.abs(w.driftMs), threshold: DRIFT_S * 1000,
    reason: `${bad.length} cue${bad.length > 1 ? 's' : ''} more than ${DRIFT_S * 1000} ms from the nearest beat (before snapping)`,
    drifts: bad,
  });
}

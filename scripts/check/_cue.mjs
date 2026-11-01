// W-CUE's verdict, pure (SPEC §7, §9), so it runs in a browser (the studio). Two judgements:
//   the grid: a cue more than 40 ms from the nearest beat (an end-anchored cue is held at its landing, the picture event it meets);
//   the sound: with the sync lock `mm sound` wrote into out/cues.json, where the rendered cue sits against its picture: a sound
//   leading by more than 45 ms reads early, a struck peak more than 75 ms late reads late, a whoosh apex stays within 45 ms of
//   its cut, a riser ends 250 ms before to 30 ms after its hit and rings no more than 30 ms past its peak. A deviation that one
//   role offset explains is deliberate and named; a beat's `params.cue.soundOk` acknowledges one.
// `getGrid()` returns the beat grid as scripts/sound.mjs loadGrid gives it ({ beats: number[] | null, declared, missing?, unusable?,
// kickShare? }); `getLocks()` the `cues` of out/cues.json or null. Both are called only once the schedule has cues.
// W-CUE.mjs (mm check) passes what it reads from disk; timing.mjs passes ctx.grid.
import { rule } from '../lib/rule.mjs';
import { DRIFT_S, cueEvents, nearest } from '../lib/cues.mjs';
import { judgeLock } from '../lib/sound-place.mjs';

export function cueVerdict(schedule, getGrid, getLocks = () => null) {
  if (schedule?.kind === 'deck') return rule('W-CUE', 'SKIP', { reason: 'deck cues sit on presses, not on a clock with a beat grid' });
  const cues = cueEvents(schedule).filter((c) => c.name !== 'bed');
  if (!cues.length && !cueEvents(schedule).length) return rule('W-CUE', 'SKIP', { reason: 'the schedule has no cues' });
  const grid = getGrid();
  if (grid.missing) return rule('W-CUE', 'WARN', { reason: `audio.beats names a file that does not exist: ${grid.missing}`, file: grid.missing });
  const locks = getLocks?.() ?? null;

  // Pair each cue with its lock: the n-th cue of a name with the n-th lock of that name. The lock knows where the sound plays (the gate's own
  // schedule does not load sound modules, so it reads an end-anchored cue at its beat's arrival); without a lock the schedule's picture event stands.
  const seen = new Map(), pairs = cues.map((c) => {
    const k = seen.get(c.name) ?? 0;
    seen.set(c.name, k + 1);
    const l = (locks ?? []).filter((x) => x.lock && x.name === c.name)[k];
    return { c, l: l ?? null, pictureS: l?.lock?.pictureS ?? c.pictureS };
  });

  // the grid
  const useGrid = Boolean(grid.beats) && !grid.unusable;
  const rows = useGrid ? pairs.map(({ c, pictureS }) => {
    const b = nearest(grid.beats, pictureS);
    return { cue: c.name, selector: c.selector, instant: pictureS, nearestBeat: b, driftMs: Math.round((b - pictureS) * 1000) };
  }) : [];
  const bad = rows.filter((r) => Math.abs(r.driftMs) > DRIFT_S * 1000 + 1e-9);

  // the sound
  const sync = [], deliberate = [], acknowledged = [];
  let judged = 0;
  for (const { c, l, pictureS } of pairs) {
    if (!l) continue;
    judged++;
    const j = judgeLock(l.lock, { soundOk: c.params?.soundOk });
    if (j.status === 'issue') sync.push({ cue: c.name, selector: c.selector, instant: pictureS, test: j.test, issue: j.issue });
    else if (j.status === 'deliberate') deliberate.push({ cue: c.name, instant: pictureS, explained: j.explained.text, offsetMs: j.explained.offsetMs });
    else if (j.status === 'acknowledged') acknowledged.push({ cue: c.name, instant: pictureS, reason: j.reason, issue: j.issue });
  }

  if (!useGrid && !judged) {
    return rule('W-CUE', 'SKIP', { reason: grid.unusable
      ? `the beat grid is marked usable: false by the kick check (${grid.kickShare != null ? `${Math.round(grid.kickShare * 100)} %` : 'under half'} of its beats land on a kick): cues are not snapped to it`
      : 'no beat grid (audio.beats is null): cues are not snapped' });
  }
  const extra = { ...(deliberate.length ? { deliberate } : {}), ...(acknowledged.length ? { acknowledged } : {}) };
  if (!bad.length && !sync.length) {
    return rule('W-CUE', 'PASS', { measured: Math.max(0, ...rows.map((r) => Math.abs(r.driftMs))), threshold: DRIFT_S * 1000, ...extra });
  }
  const parts = [];
  if (bad.length) parts.push(`${bad.length} cue${bad.length > 1 ? 's' : ''} more than ${DRIFT_S * 1000} ms from the nearest beat (before snapping)`);
  if (sync.length) parts.push(`${sync.length} sound${sync.length > 1 ? 's' : ''} off the picture: ${sync.map((s) => `${s.cue} at ${s.instant.toFixed(3)} s: ${s.issue}`).join('; ')}`);
  const first = bad.length ? bad.reduce((a, r) => (Math.abs(r.driftMs) > Math.abs(a.driftMs) ? r : a)) : sync[0];
  return rule('W-CUE', 'WARN', {
    selector: first.selector, instant: first.instant, measured: bad.length ? Math.abs(first.driftMs) : null, threshold: DRIFT_S * 1000,
    reason: parts.join('; '), ...(bad.length ? { drifts: bad } : {}), ...(sync.length ? { sync } : {}), ...extra,
  });
}

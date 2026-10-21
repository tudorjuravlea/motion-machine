// W-CUE (SPEC §7, §9): a sound cue more than 40 ms from the nearest beat when a grid exists
// (provisional). Reads the schedule's cue events *before* snapping, so it reports the drift the
// mixer will correct. Without a grid, or without cues, there is nothing to measure (SKIP).
// The verdict is pure (./_cue.mjs, shared with the studio's timing.mjs); this file reads the grid.
import { loadGrid } from '../sound.mjs';
import { cueVerdict } from './_cue.mjs';

export default async function (ctx) {
  return cueVerdict(ctx.schedule, () => loadGrid(ctx.dir, ctx.story));
}

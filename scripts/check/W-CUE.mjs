// W-CUE (SPEC §7, §9): a sound cue more than 40 ms from the nearest beat when a grid exists, and a rendered cue off its
// picture event (provisional). Reads the schedule's cue events *before* snapping, so it reports the drift the mixer will
// correct, and the sync lock `mm sound` wrote into out/cues.json, so it judges the sound where it plays (an end-anchored cue at
// its landing). Without a usable grid and without a lock, or without cues, there is nothing to measure (SKIP).
// The verdict is pure (./_cue.mjs, shared with the studio's timing.mjs); this file reads the grid and the locks.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGrid } from '../sound.mjs';
import { cueVerdict } from './_cue.mjs';

export default async function (ctx) {
  return cueVerdict(ctx.schedule, () => loadGrid(ctx.dir, ctx.story), () => {
    const file = join(ctx.dir, 'out', 'cues.json');
    if (!existsSync(file)) return null;
    try { const j = JSON.parse(readFileSync(file, 'utf8')); return (Array.isArray(j) ? j : j.cues ?? []).filter((c) => c.lock); } catch { return null; }
  });
}

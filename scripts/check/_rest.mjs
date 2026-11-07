// Shared by G-REST and W-SCENE-END (not a rule): the instants at which a picture should be finished,
// and the first element the kit reports mid-entrance there.
import { round } from './_lib.mjs';

const LAST = 1e-3;   // the last instant of a scene: its end minus a millisecond
const TOL = 1e-6;    // progress is u/d in floating point: 0.9999999 at a settle instant is done

/** A deck's rests 0..presses, and a film's settle rests (where a scene's last arrival has finished). */
export function settleProbes(schedule) {
  if (schedule.kind === 'deck') return schedule.rests.map((t) => ({ t, scene: null }));
  return schedule.holds.map((h) => ({ t: h.from, scene: h.scene }));
}

/** A film's scene ends: each scene's last instant (the film's end for the last scene). */
export function sceneEndProbes(schedule) {
  return schedule.scenes.map((s, i) => ({ t: i === schedule.scenes.length - 1 ? schedule.duration : s.end - LAST, scene: s.id }));
}

/** The first probe whose scene has an element strictly between 0 and 1: { t, scene, selector, progress } or null. */
export async function firstMidEntrance(ctx, probes) {
  for (const { t, scene } of probes) {
    await ctx.mm.seek(t);
    const rep = await ctx.mm.report();
    const mid = rep.elements.find((e) => (!scene || e.scene === scene) && e.progress > TOL && e.progress < 1 - TOL);
    if (mid) return { t: round(t), scene, selector: mid.selector, progress: round(mid.progress) };
  }
  return null;
}

// Ground truth for the motion-capture tests: what the kit's own schedule says a
// reference film contains, never typed numbers. A labelled film is a piece (story + style) and the
// video the kit rendered from it; its truth is the schedule of that story under that style, plus the
// motion style it was made with (energy, arrivalsPer10s, durations, headline entrance).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule, resolveStory } from '../../runtime/kit/schedule.js';
import { ROOT } from '../../scripts/lib/validate.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The capture's cut kind for a transition pattern (blur-crossfade is a crossfade with blur). */
export const KIND_OF = {
  'transitions/hard-cut': 'hard', 'transitions/crossfade': 'fade', 'transitions/blur-crossfade': 'fade',
  'transitions/push': 'push', 'transitions/whip-pan': 'whip-pan', 'transitions/wipe': 'wipe',
  'transitions/iris': 'iris', 'transitions/color-dip': 'dip', 'transitions/zoom-through': 'zoom',
};

/** The entrance families capture can tell apart (SPEC §13 amendment). */
export const FAMILY_OF = {
  'entrances/slam': 'slam|punch', 'entrances/punch': 'slam|punch', 'entrances/rise': 'rise|fade', 'entrances/fade': 'rise|fade',
  'entrances/blur-fade': 'blur-fade', 'entrances/pop': 'pop',
};

/**
 * @param {string} dir  piece folder
 * @param {string} styleFile  style file inside it
 * @returns {{ style: object, motion: object, duration: number, cuts: object[], arrivals: object[] }}
 */
export async function truthOf(dir, styleFile = 'style.json') {
  const story = read(join(dir, 'story.json'));
  const style = read(join(dir, styleFile));
  const resolved = resolveStory(story, style);
  const refs = new Set();
  for (const sc of resolved.scenes) {
    refs.add(sc.cut);
    for (const b of sc.beats) { refs.add(b.fx); if (b.emphasis) refs.add(b.emphasis); }
  }
  const patterns = {};
  for (const r of refs) {
    for (const base of [join(dir, 'patterns'), join(ROOT, 'patterns')]) {
      const p = join(base, r, 'pattern.js');
      if (existsSync(p)) { patterns[r] = (await import(p)).default; break; }
    }
  }
  const s = schedule(story, style, { patterns });
  const cuts = s.scenes.slice(1).map((sc, i) => {
    const scene = resolved.scenes[i + 1];
    const dirParam = patterns[sc.cut.pattern]?.params?.direction;
    const direction = dirParam ? (scene.cutParams?.direction ?? dirParam.default) : null;
    return { t: sc.start, d: sc.cut.d, pattern: sc.cut.pattern, kind: KIND_OF[sc.cut.pattern] ?? 'other', direction };
  });
  const arrivals = s.events.filter((e) => e.kind === 'arrive').map((e) => ({ t: e.t, d: e.d, fx: e.fx, spring: !!e.spring }));
  const motion = style.from?.motion ? read(join(ROOT, style.from.motion)) : null;
  return { style, motion, duration: s.duration, cuts, arrivals };
}

/** The labelled films: each is a rendered video, the piece it came from and the style file used. The two golden
 *  films are tracked copies of the golden exports (out/ is git-ignored), so a fresh clone and CI can run these
 *  tests; re-copy them whenever the golden pieces change. */
export const LABELLED = [
  { id: 'golden-kinetic', video: 'fixtures/capture/reference/golden-film-kinetic-16x9.mp4', dir: 'pieces/golden-film-kinetic', style: 'style.json' },
  { id: 'golden-editorial', video: 'fixtures/capture/reference/golden-film-editorial-16x9.mp4', dir: 'pieces/golden-film-editorial', style: 'style.json' },
  ...['a', 'b'].flatMap((s) => ['calm', 'premium', 'kinetic'].map((m) => ({
    id: `tempo-${s}-${m}`, video: `fixtures/capture/reference/tempo-${s}-${m}.mp4`, dir: `fixtures/capture/reference/pieces/tempo-${s}`, style: `style-${m}.json`,
  }))),
].map((f) => ({ ...f, video: join(ROOT, f.video), dir: join(ROOT, f.dir) }));

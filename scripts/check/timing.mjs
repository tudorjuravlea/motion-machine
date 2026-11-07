// The live gate: the rules whose verdict needs only the schedule, the
// story and the style, runnable in Node and in a browser. It imports the very rule files `mm check`
// runs (W-CUE through its pure verdict, ./_cue.mjs), and nothing in its import graph is a Node
// built-in or a package (tests/check/timing.test.mjs walks it).
//
// ctx, the fields these rules read from the ctx scripts/check.mjs builds, for one format:
//   schedule  the GATE's schedule, exactly as check.mjs builds it: runtime/kit/schedule.js
//             schedule(story, style, { patterns }) of that format's resolved story, with no `each` option;
//             patterns = { [ref]: default export of <patternsBase>/<ref>/pattern.js } for every ref the
//             story makes outside layouts/ and sound/ (check.mjs loadPatterns; a missing module is left out).
//             Not the studio's drawing schedule: scripts/studio/model.js takes the kit's schedule built
//             with `each` (data-each children, data-stagger), which can count children differently
//             (W-FADE-ONLY, W-DEAD, W-QUIET, W-PACE). The studio builds this one separately, in the page,
//             the way tests/check/timing.browser.test.mjs does, and passes it here.
//   story     the resolved story of that format: resolveStory(forFormat(written, format), style), then
//             addImplicitPlays(story, metaOf) (check.mjs ctx.story)
//   style     the piece's style.json as parsed (check.mjs ctx.style; W-PACE, W-HOLD read `pacing`,
//             W-FADE-ONLY `bans`/`allow`, W-ASK `ask`)
//   grid      optional: the beat grid as scripts/sound.mjs loadGrid(dir, story) returns it,
//             { beats: number[] | null, declared: boolean, missing?: string }; in a browser,
//             { beats: beatsOf(json), declared: true } from scripts/lib/cues.mjs, or
//             { beats: null, declared: true, missing: <audio.beats as written> } when the file is absent
//             (loadGrid reports the same story-relative path, so the evidence is equal). Omitted or null,
//             a story that declares audio.beats and has cues gets W-CUE SKIP (the grid was not passed);
//             a story without audio.beats needs none.
// A rule that throws gives one row, as scripts/check.mjs gives it (without `format`):
//   { id, status: 'FAIL' for G-*, 'WARN' for W-*, evidence: { reason: 'rule crashed: <message>', crash: true } }.
// Rules left out, and why: G-REST, W-SCENE-END, W-STAGGER (cascade half) read the page; W-MIX reads out/cues.json
// and imports sound pattern modules from disk; the rest read the page, pixels or files.
import { rule } from '../lib/rule.mjs';
import { cueEvents } from '../lib/cues.mjs';
import { EPS, round, words } from './_pure.mjs';
import { cueVerdict } from './_cue.mjs';
import gDead, { keyframes, WINDOW_S as DEAD_S } from './W-DEAD.mjs';
import gLength from './W-LENGTH.mjs';
import gQuiet from './W-QUIET.mjs';
import wRead, { readingOf, lineFloor, sceneNeed, lineEnd } from './W-READ.mjs';
import wPace from './W-PACE.mjs';
import wHold from './W-HOLD.mjs';
import wFadeOnly from './W-FADE-ONLY.mjs';
import wAsk from './W-ASK.mjs';

/** In scripts/check.mjs IDS order. */
export const TIMING_IDS = ['W-DEAD', 'W-LENGTH', 'W-QUIET', 'W-READ', 'W-PACE', 'W-HOLD', 'W-CUE', 'W-FADE-ONLY', 'W-ASK'];

function wCue(ctx) {
  if (ctx.grid == null && ctx.story?.audio?.beats && ctx.schedule?.kind !== 'deck' && cueEvents(ctx.schedule).length) {
    return rule('W-CUE', 'SKIP', { reason: `the beat grid (${ctx.story.audio.beats}) was not passed in ctx.grid` });
  }
  return cueVerdict(ctx.schedule, () => ctx.grid ?? { beats: null, declared: false });
}

const RUN = { 'W-DEAD': gDead, 'W-LENGTH': gLength, 'W-QUIET': gQuiet, 'W-READ': wRead, 'W-PACE': wPace, 'W-HOLD': wHold, 'W-CUE': wCue, 'W-FADE-ONLY': wFadeOnly, 'W-ASK': wAsk };

/** @param {{ schedule: object, story: object, style: object, grid?: object }} ctx  @returns {Promise<{ id, status, evidence }[]>} */
export async function timingRules(ctx) {
  const rows = [];
  for (const id of TIMING_IDS) {
    try {
      rows.push(...[await RUN[id](ctx)].flat().filter(Boolean));
    } catch (e) {
      rows.push({ id, status: id.startsWith('G-') ? 'FAIL' : 'WARN', evidence: { reason: `rule crashed: ${e.message}`, crash: true } });
    }
  }
  return rows;
}

// A duration written into a story is rounded to 0.01 s; the floor is the smallest such value that passes.
const ceil01 = (x) => Math.ceil(round(x * 100, 6)) / 100;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * For each film scene, the shortest duration at which every line has settled and holds for its floor
 * (W-READ's two halves: words × 0.3 s plus the last arrival, and each line settled for its floor until
 * its exit or its scene's end); null when no duration helps (a line that exits before it can be read).
 * Below it, W-READ warns, or a line is still arriving when the scene ends (W-READ leaves that to
 * W-SCENE-END, so W-READ alone may pass again far below the floor). And the windows longer than W-DEAD's
 * limit. A deck: no floors, no dead windows (both rules SKIP decks).
 * @param schedule  the gate's schedule of one format (as ctx.schedule above)
 * @param story     the resolved story of that format (ctx.story above), not the raw story the timeline
 *                  model takes: a story that still has `variants` is refused (it would count the base beats)
 * @param style     the piece's style: its `gate.read` sets the reading speed and the line floors, as in W-READ; its `gate.deadS` the dead window
 * @returns {{ scenes: { id, minDuration: number|null, reason: string }[], dead: { from, to, gap }[] }}
 */
export function floors(schedule, story, style) {
  const read = readingOf(style);
  const window = style?.gate?.deadS ?? DEAD_S;
  if (schedule.kind === 'deck' || story.kind === 'deck') return { scenes: [], dead: [] };
  const raw = story.scenes.find((sc) => sc.variants);
  if (raw) throw new TypeError(`floors takes the resolved story of one format (ctx.story); scene "${raw.id}" still has variants`);
  const scenes = story.scenes.map((sc) => {
    const start = schedule.scenes.find((s) => s.id === sc.id)?.start ?? 0;
    const { words: n, lastAt, need: first } = sceneNeed(sc, read);
    let need = first;
    let reason = `${plural(n, 'word')} × ${read.perWordS} s + last arrival at ${round(lastAt, 2)} s`;
    for (const it of schedule.items ?? []) {
      const k = words(it.beat?.text);
      if (!k || it.parent || it.scene !== sc.id) continue;
      const floor = lineFloor(k, read);
      if (it.exit) {
        const settled = lineEnd(it, schedule) - (it.start + it.d);
        if (settled < floor - EPS) return { id: sc.id, minDuration: null, reason: `${it.selector} exits ${round(Math.max(0, settled), 2)} s after it settles; it needs ${floor} s, and no scene duration changes that` };
        continue;
      }
      const line = it.start - start + it.d + floor;   // the scene's end, the line's end without an exit, must reach this
      if (line > need + EPS) { need = line; reason = `${it.selector} (${plural(k, 'word')}) settles at ${round(it.start - start + it.d, 2)} s and needs ${floor} s on screen`; }
    }
    return { id: sc.id, minDuration: ceil01(need), reason };
  });
  const ts = keyframes(schedule);
  const dead = [];
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap > window + EPS) dead.push({ from: ts[i - 1], to: ts[i], gap: round(gap) });
  }
  return { scenes, dead };
}

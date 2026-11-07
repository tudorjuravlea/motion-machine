// What the studio computes from a story, with the kit's and the gate's own code:
//   kit schedule   as runtime/kit/kit.js mount builds it: schedule(addImplicitPlays(resolveStory(forFormat
//                  (story, format), style)), style, { patterns: every module the piece loads, each }), where
//                  `each` is read from the mounted stage (data-each children, data-stagger). The timeline
//                  model is drawn from it.
//   gate schedule  as scripts/check.mjs builds it: the same resolved story, schedule(story, style,
//                  { patterns }) with no `each` and no sound modules (scripts/check.mjs loadPatterns). The
//                  live timing rules and the floors read it (scripts/check/timing.mjs header).
// Nothing here times anything itself.
import { addImplicitPlays, forFormat, resolveStory, schedule } from '../../../runtime/kit/schedule.js';
import { recipeModule } from '../../../runtime/kit/synth.js';
import { timelineModel } from '../model.js';
import { floors, timingRules } from '../../check/timing.mjs';
import { beatsOf } from '../../lib/cues.mjs';

const json = async (url) => { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };

/** Every pattern ref a resolved story uses, as the kit loads them (cues as sound/<cue>). */
function kitRefs(story) {
  const refs = new Set();
  for (const sc of story.scenes) {
    refs.add(sc.cut); if (sc.move) refs.add(sc.move);
    for (const b of sc.beats) {
      refs.add(b.fx); if (b.exit) refs.add(b.exit); if (b.emphasis) refs.add(b.emphasis);
      if (b.cue) refs.add(`sound/${b.cue}`);
      for (const a of b.screen ?? []) refs.add(a.do);
    }
  }
  return [...refs].filter((r) => typeof r === 'string' && r.includes('/') && !r.startsWith('layouts/'));
}

/** A cascade's `each` options as the mounted kit measured them: { [selector]: { n, stagger } }. */
export function eachFromSchedule(sched) {
  const out = {};
  for (const it of sched?.items ?? []) {
    if (!it.each || it.parent) continue;
    out[it.selector] = it.beat?.params?.stagger != null ? { n: it.each.n } : { n: it.each.n, stagger: it.each.step };
  }
  return out;
}

export function createEngine({ piece, patternsBase }) {
  const modules = new Map();   // ref -> default export | null
  const metas = new Map();     // folder asset -> media.json | null
  let grid = { json: null, gate: { beats: null, declared: false } }, gridFor;

  async function ensure(story) {
    const refs = kitRefs(story).filter((r) => !modules.has(r));
    await Promise.all(refs.map(async (ref) => {
      modules.set(ref, null);
      try { modules.set(ref, (await import(`/${patternsBase}/${ref}/pattern.js`)).default ?? null); } catch {
        // a cue that is data (recipe.json) gives its length like a code cue; any other missing module leaves the kit's default timing
        const recipe = ref.startsWith('sound/') ? await json(`/${patternsBase}/${ref}/recipe.json`) : null;
        if (recipe) modules.set(ref, recipeModule(recipe));
      }
    }));
    const folders = story.scenes.flatMap((sc) => sc.beats.flatMap((b) => [b.asset, ...(b.screen ?? []).map((a) => (a.do === 'screen/swap' || a.do === 'screen/compare' ? a.params?.to : null))]))
      .filter((a) => typeof a === 'string' && a.endsWith('/') && !metas.has(a));
    await Promise.all([...new Set(folders)].map(async (a) => { metas.set(a, null); metas.set(a, await json(`/${piece}/${a}media.json`)); }));
  }

  async function loadGrid(raw) {
    const file = raw.audio?.beats ?? null;
    if (file === gridFor) return;
    gridFor = file;
    if (!file) { grid = { json: null, gate: { beats: null, declared: false } }; return; }
    const j = await json(`/${piece}/${file}`);
    grid = j ? { json: j, gate: { beats: beatsOf(j), declared: true } } : { json: null, gate: { beats: null, declared: true, missing: file } };
  }

  /** The kit schedule, the timeline model, the live verdicts and the floors of `raw` in `format`. */
  async function compute(raw, { format, style, each }) {
    const resolved = () => resolveStory(forFormat(structuredClone(raw), format), style);
    const first = resolved();
    await Promise.all([ensure(first), loadGrid(raw)]);
    const metaOf = (a) => metas.get(a) ?? null;
    const loaded = (keep) => Object.fromEntries([...modules].filter(([r, m]) => m && keep(r)));
    const kit = schedule(addImplicitPlays(first, metaOf), style, { patterns: loaded(() => true), each });
    const gateStory = addImplicitPlays(resolved(), metaOf);
    const gate = schedule(gateStory, style, { patterns: loaded((r) => !r.startsWith('sound/')) });
    const model = timelineModel(kit, raw, { format, grid: grid.json });
    const verdicts = await timingRules({ schedule: gate, story: gateStory, style, grid: grid.gate });
    let fl = { scenes: [], dead: [] };
    try { fl = floors(gate, gateStory, style); } catch { /* a deck or an unusual story: no floors drawn */ }
    return { kit, gate, model, verdicts, floors: fl };
  }

  /** A pattern's module (for its params), imported once; a failed import is tried again next time. */
  async function module(ref) {
    if (!modules.get(ref)) {
      try { modules.set(ref, (await import(`/${patternsBase}/${ref}/pattern.js`)).default ?? null); } catch { modules.set(ref, null); }
    }
    return modules.get(ref);
  }

  /** The slot names a layout offers, read from its pattern.html; a failed fetch is not kept. */
  const slots = new Map();
  async function layoutSlots(ref) {
    if (!slots.has(ref)) {
      const p = (async () => {
        const r = await fetch(`/${patternsBase}/${ref}/pattern.html`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        return [...new Set([...doc.querySelectorAll('[data-slot]')].map((e) => e.dataset.slot))];
      })();
      slots.set(ref, p);
      p.catch(() => slots.delete(ref));
    }
    return slots.get(ref).catch(() => []);
  }

  return { compute, module, layoutSlots };
}

/** The live counts: { fail, warn } of non-passing rows. */
export const countsOf = (rows) => ({ fail: rows.filter((r) => r.status === 'FAIL').length, warn: rows.filter((r) => r.status === 'WARN').length });

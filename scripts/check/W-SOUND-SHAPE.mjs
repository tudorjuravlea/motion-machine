// W-SOUND-SHAPE (SPEC §7, §9): the shape of a film's sound, read from its cue list and the stems (provisional):
// no hook sound in the first 0.6 s (or within 0.35 s of a first event that comes later; films under 3 s are
// exempt), a hierarchy flatter than 8 dB (P10 to P90 of the cues' loudest 100 ms, from six cues), a machine-gun
// (five identical cues or more at gaps of 0.35 s or less; a `key` run with varied gaps is typing). Its evidence
// carries `listen`: the five places to listen first, each a question for the ear. Levels come from
// out/stems/cues.wav when `mm sound` has run, else from the cue peaks in out/cues.json; with neither, a clean
// result is a partial SKIP, never PASS. The verdict is pure (./_shape.mjs); this file reads the files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/rule.mjs';
import { cueEvents } from '../lib/cues.mjs';
import { decodeStereo } from '../lib/audio-decode.mjs';
import { cueLevelsFromStem, shapeVerdict } from './_shape.mjs';

const SR = 48000;
const OPENING = new Set(['arrive', 'move', 'depart']);

export default async function (ctx) {
  if (ctx.schedule?.kind === 'deck') return shapeVerdict({ cues: [], levels: null, duration: 0, deck: true });
  if (ctx.style?.sound?.palette === 'none') return rule('W-SOUND-SHAPE', 'SKIP', { reason: 'style.sound.palette is "none": cues are not rendered' });
  const cues = cueEvents(ctx.schedule).filter((c) => c.name !== 'bed').map((c) => ({ t: c.t, name: c.name, ...(c.params?.seed != null ? { seed: c.params.seed } : {}) }));
  const duration = ctx.schedule?.duration ?? (cues.at(-1)?.t ?? 0);
  const firstEventS = (ctx.schedule?.events ?? []).filter((e) => OPENING.has(e.kind) && typeof e.t === 'number').reduce((m, e) => Math.min(m, e.t), Infinity);

  let levels = null;
  const stemFile = join(ctx.dir, 'out', 'stems', 'cues.wav');
  if (cues.length && existsSync(stemFile)) {
    try { levels = cueLevelsFromStem({ cues, channels: await decodeStereo(stemFile, SR), sr: SR }); } catch { levels = null; }
  }
  const cuesFile = join(ctx.dir, 'out', 'cues.json');
  if (!levels && cues.length && existsSync(cuesFile)) {
    try {
      const j = JSON.parse(readFileSync(cuesFile, 'utf8'));
      const list = (Array.isArray(j) ? j : j.cues ?? []).filter((c) => c.name !== 'bed' && Number.isFinite(c.peakDb));
      if (list.length) levels = list.map((c) => ({ t: c.at, name: c.name, db: c.peakDb, measure: 'peak' }));
    } catch { levels = null; }
  }
  return shapeVerdict({ cues, levels, duration, firstEventS: Number.isFinite(firstEventS) ? firstEventS : null });
}

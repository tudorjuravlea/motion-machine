// W-SOUND-SHAPE (SPEC §7, §9): the shape of a film's sound, read from its cue list and the stems (provisional):
// no hook sound in the first 0.6 s (or within 0.35 s of a first event that comes later; films under 3 s are
// exempt), a hierarchy flatter than 8 dB (P10 to P90 of the cues' loudest 100 ms, from six cues), a machine-gun
// (five identical cues or more at gaps of 0.35 s or less; a `key` run with varied gaps is typing). Its evidence
// carries `listen`: the five places to listen first, each a question for the ear. Levels come from
// out/stems/cues.wav when `mm sound` has run, else from the cue peaks in out/cues.json; with neither, a clean
// result is a partial SKIP, never PASS. The verdict is pure (./_shape.mjs); this file reads the files.
// A payoff check follows when the mix has a bed or a track (provisional): at least 0.4 s at or under -40 dBFS in
// the two seconds before the loudest 100 ms (./_payoff.mjs). It reads out/mix.wav as shipped, else the sum of the stems; on a
// cue-only film it would pass trivially, so there it is a sub-check SKIP, said in `evidence.payoff`. A style's `gate.payoff`
// (quietS, floorDb, windowS) sets it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/rule.mjs';
import { cueEvents } from '../lib/cues.mjs';
import { decodeStereo } from '../lib/audio-decode.mjs';
import { cueLevelsFromStem, shapeVerdict } from './_shape.mjs';
import { payoffOf, QUIET_S, FLOOR_DB, WINDOW_S } from './_payoff.mjs';

const SR = 48000;
const OPENING = new Set(['arrive', 'move', 'depart']);

/** The payoff sub-check: { status, partial?, reason?, ...detail }. */
async function payoffCheck(ctx) {
  const set = ctx.style?.gate?.payoff ?? {};
  const want = { thresholdS: set.quietS ?? QUIET_S, floorDb: set.floorDb ?? FLOOR_DB, windowS: set.windowS ?? WINDOW_S };
  const stems = join(ctx.dir, 'out', 'stems'), has = (f) => existsSync(join(stems, f));
  const declared = cueEvents(ctx.schedule).some((c) => c.name === 'bed') || Boolean(ctx.story?.audio?.track);
  const music = has('bed.wav') || has('track.wav');
  if (!declared && !music) return { status: 'SKIP', reason: 'a cue-only film: it would pass trivially, so the payoff is not read' };
  const mixFile = join(ctx.dir, 'out', 'mix.wav');
  const files = existsSync(mixFile) ? [mixFile] : ['bed.wav', 'track.wav', 'cues.wav'].filter(has).map((f) => join(stems, f));
  if (!music && !existsSync(mixFile)) return { status: 'SKIP', partial: true, reason: 'the film has a bed or a track but out/stems holds none to read: run `mm sound`' };
  const sum = [];
  for (const f of files) {
    let ch;
    try { ch = await decodeStereo(f, SR); } catch { return { status: 'SKIP', partial: true, reason: `the payoff could not read ${f}` }; }
    ch.forEach((c, k) => {
      if (!sum[k] || sum[k].length < c.length) { const grown = new Float32Array(c.length); if (sum[k]) grown.set(sum[k]); sum[k] = grown; }
      for (let i = 0; i < c.length; i++) sum[k][i] += c[i];
    });
  }
  const read = files.length === 1 && files[0] === mixFile ? 'mix' : 'stems';
  const got = payoffOf(sum, SR, { floorDb: want.floorDb, windowS: want.windowS });
  if (!got) return { status: 'SKIP', partial: true, reason: 'the mix is silent: no loudest moment to earn' };
  const detail = { ...want, quietS: got.quietS, loudestAtS: Math.round(got.loudestAtS * 100) / 100, read };
  if (got.quietS + 1e-9 < want.thresholdS) return { status: 'WARN', ...detail };
  return { status: 'PASS', ...detail };
}

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
  const v = shapeVerdict({ cues, levels, duration, firstEventS: Number.isFinite(firstEventS) ? firstEventS : null });
  if (v.status === 'SKIP' && !v.evidence.partial) return v;
  const p = await payoffCheck(ctx);
  const { status: _s, partial: _p, reason: _r, ...detail } = p;
  const evidence = { ...v.evidence, payoff: p.status === 'SKIP' ? { status: 'SKIP', reason: p.reason } : { status: p.status, ...detail } };
  if (p.status === 'WARN') {
    const message = `${detail.quietS} s at or under ${detail.floorDb} dBFS in the ${detail.windowS} s before the loudest 100 ms (${detail.loudestAtS} s), ${detail.thresholdS} s wanted: the bed never lets go for the payoff`;
    const reasons = [...(v.evidence.reasons ?? []), { kind: 'payoff', message, instant: detail.loudestAtS }];
    return rule('W-SOUND-SHAPE', 'WARN', { ...evidence, instant: v.status === 'WARN' ? v.evidence.instant : detail.loudestAtS, measured: v.evidence.measured, reason: [v.status === 'WARN' ? v.evidence.reason : null, message].filter(Boolean).join('; '), kinds: [...new Set([...(v.evidence.kinds ?? []), 'payoff'])], reasons, ...(v.evidence.partial ? { partial: true } : {}) });
  }
  if (p.status === 'SKIP' && p.partial && v.status === 'PASS') return rule('W-SOUND-SHAPE', 'SKIP', { ...evidence, partial: true, reason: `partial: the hook, the spread and the runs passed; not measured: the payoff (${p.reason})` });
  if (p.status === 'SKIP' && p.partial && v.status === 'SKIP') return rule('W-SOUND-SHAPE', 'SKIP', { ...evidence, partial: true, reason: `${v.evidence.reason}; the payoff (${p.reason})` });
  return rule('W-SOUND-SHAPE', v.status, evidence);
}

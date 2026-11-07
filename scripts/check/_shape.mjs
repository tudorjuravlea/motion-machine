// W-SOUND-SHAPE's verdict, pure (SPEC §7, §9): what a critic hears in the shape of a film's sound from its cue
// list and the level of each cue. A hook in the first 0.6 s, a spread of levels, no machine-gun, and the five
// places to listen first. The thresholds restate the critique axes of a sound-design review (ideas only);
// the code is our own. No Node built-in, so the studio can load it.
import { rule } from '../lib/rule.mjs';
import { loudest100ms } from '../lib/audio-measure.mjs';

export const HOOK_S = 0.6;             // the first sound by now, or within HOOK_NEAR_S of the first event when that comes later
export const HOOK_NEAR_S = 0.35;
export const HOOK_MIN_FILM_S = 3;      // a film shorter than this has no hook to ask for
export const SPREAD_DB = 8;            // P10 to P90 of the cues' loudest 100 ms
export const SPREAD_MIN_CUES = 6;
export const GUN_RUN = 5;              // identical cues in a row ...
export const GUN_GAP_S = 0.35;         // ... each within this gap of the one before
export const GUN_VOICES = 2;           // ... voiced with no more than this many seeds
export const TYPING_CV = 0.1;          // a `key` run whose gaps vary by at least this share of their mean is typing
export const LISTEN_N = 5;
export const LISTEN_APART_S = 1.5;
export const CLUSTER_S = 2;
export const CLUSTER_MIN = 3;
export const DEAD_AIR_S = 3;

const r2 = (x) => Math.round(x * 100) / 100;

/** The p-th percentile (0 to 100) of numbers, linear between ranks. */
export function percentile(values, p) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const k = ((v.length - 1) * p) / 100, lo = Math.floor(k), hi = Math.ceil(k);
  return v[lo] + (v[hi] - v[lo]) * (k - lo);
}

/** Each cue's loudest 100 ms (K-weighted LUFS) in the cue stem, from its instant to the next cue (at most 1.5 s on): [{ t, name, db, measure }]. */
export function cueLevelsFromStem({ cues, channels, sr }) {
  const n = channels[0].length;
  return cues.map((c, i) => {
    const from = Math.max(0, Math.round((c.t - 0.01) * sr));
    const to = Math.min(n, Math.round(Math.min(cues[i + 1]?.t ?? Infinity, c.t + 1.5) * sr));
    if (to - from < 2) return { t: c.t, name: c.name, db: null, measure: 'loudest 100 ms' };
    const db = loudest100ms(channels.map((ch) => ch.subarray(from, to)), sr);
    return { t: c.t, name: c.name, db: Number.isFinite(db) ? db : null, measure: 'loudest 100 ms' };
  });
}

/** Runs of identical cues sounding close together: [{ name, from, n, voices, cv }]. */
function runsOf(cues) {
  const out = [];
  let run = [];
  const flush = () => { if (run.length >= GUN_RUN) out.push(run); run = []; };
  for (const c of cues) {
    const last = run.at(-1);
    if (last && last.name === c.name && c.t - last.t <= GUN_GAP_S + 1e-9) run.push(c); else { flush(); run = [c]; }
  }
  flush();
  return out.map((r) => {
    const gaps = r.slice(1).map((c, i) => c.t - r[i].t), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const cv = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) / mean;
    return { name: r[0].name, from: r[0].t, n: r.length, voices: new Set(r.map((c) => c.seed ?? 0)).size, cv };
  });
}

/**
 * The five places a person should listen first, each a question for the ear: [{ t, why, reasons }], in time order,
 * at least LISTEN_APART_S apart (reasons that fall together share one place, at most two each).
 */
export function listenList({ cues, levels }) {
  if (!cues.length) return [];
  const known = (levels ?? []).filter((l) => Number.isFinite(l.db));
  const cand = [{ t: cues[0].t, q: `Does the film open here with a sound that earns its first second (${cues[0].name})?` }];
  if (known.length) {
    const hi = known.reduce((a, b) => (b.db > a.db ? b : a)), lo = known.reduce((a, b) => (b.db < a.db ? b : a));
    cand.push({ t: hi.t, q: `Is this the loudest cue (${hi.name}, ${r2(hi.db)} over its loudest 100 ms) on purpose?` });
    cand.push({ t: lo.t, q: `Is the quietest cue (${lo.name}, ${r2(lo.db)}) still heard?` });
  }
  let best = null;
  for (const c of cues) {
    const n = cues.filter((o) => o.t >= c.t && o.t < c.t + CLUSTER_S).length;
    if (n >= CLUSTER_MIN && (!best || n > best.n)) best = { t: c.t, n };
  }
  if (best) cand.push({ t: best.t, q: `Do these ${best.n} cues in ${CLUSTER_S} s crowd each other?` });
  let gap = null;
  cues.forEach((c, i) => { const g = c.t - cues[i - 1]?.t; if (i && g >= DEAD_AIR_S && (!gap || g > gap.g)) gap = { t: c.t, g }; });
  if (gap) cand.push({ t: gap.t, q: `Is the ${r2(gap.g)} s of quiet before this cue right, or dead air?` });
  const last = cues.at(-1);
  cand.push({ t: last.t, q: `Does the last cue (${last.name}) land the ending?` });
  const seen = new Set();
  for (const c of cues) if (!seen.has(c.name)) { seen.add(c.name); cand.push({ t: c.t, q: `Does ${c.name} fit the sounds around it?` }); }
  for (const c of cues) cand.push({ t: c.t, q: `Does the ${c.name} at ${r2(c.t)} s sit right with the picture?` });
  const picked = [];
  for (const c of cand) {
    const near = picked.find((p) => Math.abs(p.t - c.t) < LISTEN_APART_S - 1e-9);
    if (near) { if (near.reasons.length < 2) near.reasons.push(c.q); continue; }
    if (picked.length < LISTEN_N) picked.push({ t: c.t, reasons: [c.q] });
  }
  return picked.sort((a, b) => a.t - b.t).map((p) => ({ t: r2(p.t), why: p.reasons.join(' '), reasons: p.reasons }));
}

/**
 * @param {{ cues: {t:number,name:string,seed?:number}[], levels: {t:number,name:string,db:number|null,measure:string}[]|null, duration: number, deck?: boolean, firstEventS?: number|null }} a
 */
export function shapeVerdict({ cues: all, levels, duration, deck = false, firstEventS = null }) {
  if (deck) return rule('W-SOUND-SHAPE', 'SKIP', { reason: 'deck cues sit on presses, not on a clock' });
  const cues = all.filter((c) => c.name !== 'bed').sort((a, b) => a.t - b.t);
  if (!cues.length) return rule('W-SOUND-SHAPE', 'SKIP', { reason: 'the schedule has no cues' });
  const reasons = [];
  const push = (kind, message, instant) => reasons.push({ kind, message, instant });
  const evidence = {};

  // 1. a hook: the first sound in the first 0.6 s, or within 0.35 s of the first event when that comes later
  const first = cues[0].t;
  evidence.hookS = r2(first);
  if (duration >= HOOK_MIN_FILM_S) {
    const onEvent = firstEventS != null && firstEventS > HOOK_S && Math.abs(first - firstEventS) <= HOOK_NEAR_S + 1e-9;
    if (first > HOOK_S + 1e-9 && !onEvent) push('hook', `the first sound comes at ${first.toFixed(2)} s; a film opens with one in its first ${HOOK_S} s${firstEventS > HOOK_S ? `, or within ${HOOK_NEAR_S} s of its first event (${firstEventS.toFixed(2)} s)` : ''}`, first);
  } else evidence.hookExempt = `under ${HOOK_MIN_FILM_S} s`;

  // 2. a hierarchy: P10 to P90 of the cues' loudest 100 ms at least 8 dB, from six cues
  const missing = [];
  const known = (levels ?? []).filter((l) => Number.isFinite(l.db));
  if (cues.length >= SPREAD_MIN_CUES) {
    if (known.length >= SPREAD_MIN_CUES) {
      const spread = percentile(known.map((l) => l.db), 90) - percentile(known.map((l) => l.db), 10);
      evidence.spreadDb = r2(spread);
      evidence.levels = known[0].measure === 'peak' ? 'peaks in out/cues.json' : 'cue stem';
      if (spread < SPREAD_DB - 1e-9) push('hierarchy', `the cues' loudest 100 ms span ${spread.toFixed(1)} dB from P10 to P90, at least ${SPREAD_DB} dB wanted: everything is the same loudness`);
    } else missing.push('the spread of the cues\' levels (no cue stem or out/cues.json: run `mm sound`)');
  }

  // 3. no machine-gun
  for (const r of runsOf(cues)) {
    if (r.voices > GUN_VOICES) continue;
    if (r.name === 'key' && r.cv >= TYPING_CV) continue;
    push('machine-gun', `${r.n} ${r.name} cues in a row at gaps of ${GUN_GAP_S} s or less from ${r.from.toFixed(2)} s${r.name === 'key' ? ' with even gaps' : ''}`, r.from);
  }

  evidence.listen = listenList({ cues, levels });
  if (!reasons.length && missing.length) return rule('W-SOUND-SHAPE', 'SKIP', { ...evidence, partial: true, measured: cues.length, reason: `partial: the hook and runs passed; not measured: ${missing.join('; ')}` });
  if (!reasons.length) return rule('W-SOUND-SHAPE', 'PASS', { ...evidence, measured: cues.length });
  return rule('W-SOUND-SHAPE', 'WARN', {
    ...evidence, ...(missing.length ? { partial: true } : {}), instant: reasons[0].instant, measured: cues.length,
    reason: reasons.map((r) => r.message).join('; '), kinds: [...new Set(reasons.map((r) => r.kind))], reasons,
  });
}

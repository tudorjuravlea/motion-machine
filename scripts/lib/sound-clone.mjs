// Cloning a sound profile's style into a new cue (SPEC §9): analysis by synthesis. A template for the cue's family
// (input, surface, outcome) is a function of a vector in the unit cube; an evolution strategy (scripts/lib/sound-search.mjs:
// elites mutated with a shrinking step, a few fresh draws, a model-free prescreen) searches that cube, seeded. Each candidate is
// rendered (runtime/kit/synth.js renderRecipe, the samples an OfflineAudioContext plays), voiced by the profile, measured with
// scripts/lib/audio-measure.mjs (the one measurer `mm sound-listen`, `mm sound mine` and the gate use) and judged by W-PALETTE's
// checks; the candidates chosen by the prescreen are scored in full: against a sound given with --like by the multi-resolution
// log-mel, envelope, onset, tone, excess and missing score of scripts/lib/sound-score.mjs, else against the profile's bands and
// its third-octave balance; and each is checked for the artifacts W-SOUND-ARTIFACT warns for. The best three are confirmed on two
// more seeds and the one whose worst seed scores best is the cue. The same inputs give the same recipe. Library only; Node. The
// verb is scripts/sound-clone.mjs (`mm sound clone`). `search: 'random'` runs the earlier search (the same budget of random draws,
// scored by attack, ring, centre and flatness) so the two can be measured against each other.
//
//   contourOf(meaning)        'rise' | 'fall' | 'level' from the words of the meaning
//   familyOfMeaning(meaning)  'input' | 'surface' | 'outcome' from the words of the meaning
//   cloneRecipe(opts)         { recipe, family, contour, score, tried, search, artifacts, history, measured, checks } (masterGain calibrated as written)
//   cloneVariants(opts)       { variants: [cloneRecipe-like], pairs, band, inBand, distances }  N variants of one cue, neither copies nor strangers
//   variantBand(opts)         { lo, hi, within, across }  the distances of the shipped palette's takes of one cue and of its cues of one family
//   likeOf(channels, sr)      what a --like sound asks of the candidates
//   cardOf(opts)              the PATTERN.md of a cloned cue
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { familyOf, renderRecipe, seedOf } from '../../runtime/kit/synth.js';
import { loudestBalance, measure } from './audio-measure.mjs';
import { ROOT } from './browser.mjs';
import { analyseSound } from './sound-mine.mjs';
import { judgeCue, misses } from './sound-palette.mjs';
import { findArtifacts } from './sound-artifacts.mjs';
import { featureDistance, prepareTarget, scoreAgainst, soundFeatures } from './sound-score.mjs';
import { evolve, mulberry, streamOf } from './sound-search.mjs';
import { loadRecipe } from './sound-profile.mjs';

export const CANDIDATES = 64;
const POP = 16;
const PRESCREEN = POP + POP / 2;     // candidates built per generation when a --like sound makes the full score the expensive one
const UNIT_DIMS = 32;               // the draws a template can make: its random stream read from a vector of this length
const CONFIRM_SEED_STEP = 101;      // the mixer rings a cue that varies through seeds this far apart (scripts/sound.mjs)
const PENTATONIC = ['C', 'D', 'E', 'G', 'A'];
const FLOOR_S = { input: 0.012, surface: 0.065, outcome: 0.31 };
const MATERIAL = {
  bar: [[1, 0], [2.76, -27], [5.4, -35]],
  mallet: [[1, 0], [3.99, -30]],
  string: [[1, 0], [2, -12], [3, -18]],
  none: [[1, 0]],
};
const TYPICAL_T60_S = { input: 0.03, surface: 0.15, outcome: 0.35 };
const RISE = /\b(success|succe\w*|done|complete\w*|finish\w*|good|confirm\w*|saved?|sent|win\w*|up|rise|rising|positive|achiev\w*|paid|approved?|unlock\w*)\b/i;
const FALL = /\b(error|fail\w*|wrong|denied|deny|bad|down|declin\w*|reject\w*|delet\w*|remov\w*|invalid|negative|problem|break|broken|lost)\b/i;
const INPUT = /\b(tap|click\w*|press\w*|toggle\w*|switch\w*|key\w*|type\w*|hover\w*|select\w*|check\w*|knock\w*|tick\w*)\b/i;
const SURFACE = /\b(open\w*|clos\w*|navigat\w*|swipe\w*|slide\w*|panel|drawer|menu|dismiss\w*|expand\w*|collaps\w*|move\w*|transition\w*)\b/i;

const round = (x, p) => Math.round(x * 10 ** p) / 10 ** p;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mix = (rng, lo, hi) => lo + rng() * (hi - lo);

/** A recipe as JSON text laid out like the shipped ones: two-space indent, each partial pair and each partials list on one line. */
export const recipeJson = (recipe) => `${JSON.stringify(recipe, null, 2)
  .replace(/\[\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+)\s+\]/g, '[$1, $2]')
  .replace(/"partials": \[\s+((?:\[[^\]]*\],?\s*)+)\]/g, (_, body) => `"partials": [${body.trim().replace(/\s+/g, ' ')}]`)}\n`;

export const contourOf = (meaning) => (FALL.test(meaning) ? 'fall' : RISE.test(meaning) ? 'rise' : 'level');
export const familyOfMeaning = (meaning) => (INPUT.test(meaning) ? 'input' : SURFACE.test(meaning) ? 'surface' : 'outcome');

const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** The frequencies of the profile's key (a pentatonic set when it has none) within [lo, hi] Hz, ascending; never empty (the middle of the range when no note of the key fits). */
export function notesHz(profile, lo, hi) {
  const classes = new Set((profile.key?.length ? profile.key : PENTATONIC).map((k) => PITCH_CLASS[k]));
  const out = [];
  for (let m = 24; m <= 108; m++) {
    const f = 440 * 2 ** ((m - 69) / 12);
    if (f >= lo && f <= hi && classes.has(m % 12)) out.push(f);
  }
  return out.length ? out : [Math.sqrt(Math.max(lo, 20) * Math.max(hi, lo * 1.01))];
}

// The partials of a note: those the modal fit found in a tonal --like sound (the fundamental and the modes within 40 dB of it, at most six), else the profile's material.
const partialsOf = (profile, like = null) => {
  const modes = like?.tonal ? like.modal?.partials?.filter(([ratio, db]) => db >= -40 && ratio >= 0.25 && ratio <= 20).slice(0, 6) : null;
  return modes && modes.length > 1 ? modes : MATERIAL[profile.modes] ?? MATERIAL.none;
};
const layerOf = (o) => {
  const l = { kind: o.kind, ...(o.f != null ? { f: round(o.f, 2) } : {}), attackS: round(o.attackS, 4), t60: round(o.t60, 3), peak: round(o.peak ?? 1, 2) };
  if (o.glideTo != null) { l.glideTo = round(o.glideTo, 2); l.glideS = round(o.glideS, 3); }
  if (o.partials && o.partials.length > 1) l.partials = o.partials;
  if (o.filter) l.filter = o.filter;
  if (o.offsetS) l.offsetS = round(o.offsetS, 3);
  if (o.from) l.from = o.from;
  return l;
};
const finish = (name, meaning, layers, vary) => {
  const durationS = round(Math.max(...layers.map((l) => (l.offsetS ?? 0) + l.attackS + l.t60)) + 0.0005, 3);
  return { name, meaning, durationS, layers, room: { send: -22, predelayS: 0.008, sizeS: 0.25, lowpassHz: 3500 }, ...(vary ? { vary } : {}), emphasis: { subtle: 0, normal: 1, strong: 2 } };
};

// A draw inside the profile's bands: the attack of a struck note, a T60 of the family held between the ladder's own floor and ceiling.
const attackIn = (rng, profile) => mix(rng, profile.envelope.attackS[0], profile.envelope.attackS[1]);

function outcome(rng, { name, meaning, profile, contour, like }) {
  const [lo, hi] = profile.envelope.t60.outcome, reg = profile.register;
  const n = rng() < 0.35 ? 2 : 3, step = mix(rng, 0.05, 0.08), attack = attackIn(rng, profile);
  const table = notesHz(profile, Math.max(reg.minHz * 1.05, 200), Math.min(reg.maxCentreHz * 0.6, 1400));
  const near = (f) => table.reduce((b, x, i) => (Math.abs(Math.log(x / f)) < Math.abs(Math.log(table[b] / f)) ? i : b), 0);
  // the notes climb or fall through the key: start where the whole run fits (the top of the table for a fall)
  const span = Math.max(1, Math.min(table.length - 1, (n - 1) * 3)), room = Math.max(1, table.length - span);
  let root = like?.pitchHz ? near(like.pitchHz) : contour === 'rise' ? Math.floor(rng() * room) : contour === 'fall' ? span + Math.floor(rng() * room) : Math.floor(rng() * table.length);
  root = clamp(root, 0, Math.max(0, table.length - 1));
  const idx = [root];
  for (let i = 1; i < n; i++) {
    const k = Math.min(2 + Math.floor(rng() * 3), Math.max(1, Math.floor(span / (n - 1))));
    idx.push(clamp(contour === 'rise' ? idx[i - 1] + k : contour === 'fall' ? idx[i - 1] - k : idx[i - 1], 0, table.length - 1));
  }
  if (contour === 'level' && n >= 2) idx[1] = clamp(root + 3, 0, table.length - 1);          // a level pair: a fifth-ish above, held
  const budget = 0.64 - (n - 1) * step - attack, floor = Math.max(lo, FLOOR_S.outcome - (n - 1) * step - attack);
  const top = Math.min(hi, budget), t60 = top >= floor ? mix(rng, floor, top) : top;
  const partials = partialsOf(profile, like);
  const layers = idx.map((ix, i) => layerOf({ kind: 'tone', f: table[ix], attackS: attack, t60: i === n - 1 ? Math.min(t60 * 1.1, hi) : t60, peak: 1 - 0.1 * i, offsetS: i * step, partials }));
  const last = table[idx[n - 1]];
  layers.push(layerOf({ kind: 'tone', f: last * 2, attackS: attack, t60: t60 * 0.8, peak: 0.22, offsetS: (n - 1) * step, from: 1, partials: MATERIAL.none }));
  layers.push(layerOf({ kind: 'tone', f: table[near(table[idx[0]] * 1.5)], attackS: attack, t60: t60 * 0.9, peak: 0.3, offsetS: (n - 1) * step + 0.06, from: 2, partials }));
  return finish(name, meaning, layers, null);
}

function surface(rng, { name, meaning, profile, contour, like }) {
  const [lo, hi] = profile.envelope.t60.surface, reg = profile.register;
  const t60 = mix(rng, Math.max(lo, 0.05), Math.min(hi, 0.26)), up = contour === 'fall' ? false : true;
  const f0 = mix(rng, 350, Math.min(reg.maxCentreHz * 0.45, 2200)), ratio = mix(rng, 1.8, 3.2);
  const soft = like?.attackS ? like.attackS > 0.01 : rng() < 0.5;
  const attack = soft ? mix(rng, 0.012, 0.018) : attackIn(rng, profile);
  const layers = [layerOf({ kind: 'noise', filter: { type: 'bandpass', f: round(up ? f0 : f0 * ratio, 1), q: round(mix(rng, 0.7, 2), 2) }, glideTo: up ? f0 * ratio : f0, glideS: t60 * mix(rng, 0.6, 1), attackS: attack, t60, peak: 1 })];
  if (rng() < 0.5 && !(like && !like.tonal)) {
    const table = notesHz(profile, Math.max(reg.minHz * 1.05, 180), 700);
    if (table.length) layers.push(layerOf({ kind: 'tone', f: table[Math.floor(rng() * table.length)], attackS: attackIn(rng, profile), t60: t60 * 0.7, peak: 0.4, partials: partialsOf(profile, like) }));
  }
  return finish(name, meaning, layers, { pitch: 0.02, force: 0.12 });
}

function input(rng, { name, meaning, profile, like }) {
  const [lo, hi] = profile.envelope.t60.input, reg = profile.register;
  const attack = Math.min(attackIn(rng, profile), 0.003);
  const top = Math.min(hi, 0.056 - attack), t60 = mix(rng, Math.max(lo, 0.012), Math.max(top, Math.max(lo, 0.012)));
  const layers = [layerOf({ kind: 'noise', filter: { type: 'bandpass', f: round(mix(rng, 400, Math.min(reg.maxCentreHz * 0.6, 3000)), 1), q: round(mix(rng, 1, 3), 2) }, attackS: attack, t60, peak: 1 })];
  if (!(like && !like.tonal) && (like?.tonal || rng() < 0.6)) {
    const table = notesHz(profile, Math.max(reg.minHz * 1.05, 250), 900);
    if (table.length) layers.push(layerOf({ kind: 'tone', f: like?.pitchHz ?? table[Math.floor(rng() * table.length)], attackS: attack, t60: Math.min(t60 * 1.1, hi), peak: 0.6, partials: partialsOf(profile, like) }));
  }
  return finish(name, meaning, layers, { pitch: 0.02, force: 0.15 });
}

const TEMPLATES = { input, surface, outcome };

/** What a --like sound asks of the candidates, from its samples: the numbers the score compares, the sound itself, and the modes the modal fit found in it. */
export function likeOf(channels, sr) {
  const m = measure(channels, sr), a = analyseSound(channels, sr);
  return { attackS: m.attackS ?? 0.002, audibleS: m.audibleS, centroidHz: m.centroidHz, flatness: m.flatness, tonal: a.tonal, pitchHz: a.pitchHz, family: a.family, mode: a.mode, partials: a.partials, modal: a.modal, durationS: m.durationS, bandsDb: m.bandsDb, channels, sr };
}

const logRatio = (a, b) => Math.abs(Math.log(Math.max(a, 1e-9) / Math.max(b, 1e-9)));
const toneDbOf = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

/** The earlier score of a measured candidate (lower is nearer): the profile's band centres, and the --like sound when given; each miss and a wrong family cost 10. */
function scoreOf({ m, recipe, judged, profile, family, like }) {
  const [t0, t1] = profile.envelope.t60[family], [a0, a1] = profile.envelope.attackS;
  const t60 = Math.max(...recipe.layers.map((l) => l.t60));
  let s = 0;
  if (like) {
    s += logRatio((m.attackS ?? 0.002) + 0.0005, like.attackS + 0.0005) + 2 * logRatio(m.audibleS, like.audibleS) + 2 * logRatio(m.centroidHz, like.centroidHz) + Math.abs(Math.log10(m.flatness + 1e-9) - Math.log10(like.flatness + 1e-9)) / 4;
  } else {
    s += logRatio(t60, Math.sqrt(t0 * t1)) + 0.5 * logRatio((m.attackS ?? (a0 + a1) / 2) + 0.0005, (a0 + a1) / 2 + 0.0005) + 0.5 * logRatio(m.audibleS, TYPICAL_T60_S[family] * 1.2);
  }
  s += 10 * misses(judged).length + (familyOf(recipe.durationS) === family ? 0 : 10);
  return s;
}

/** The cheap score the prescreen ranks by: the earlier score plus 0.3 x the third-octave tone dB from the --like sound, or from the profile's balance when it has one (the loudest 100 ms against the set's). */
function preScoreOf(args) {
  const { m, channels, profile, like, sampleRate } = args;
  let s = scoreOf(args);
  if (like?.bandsDb) s += 0.3 * toneDbOf(m.bandsDb, like.bandsDb);
  else if (!like && profile.balance) s += 0.3 * toneDbOf(loudestBalance(channels, sampleRate), profile.balance.medianDb);
  return s;
}

/**
 * Searches for a recipe in the profile's style (a seeded evolution strategy: the same cue, profile, family, contour and --like give the same
 * recipe) and returns the nearest, with masterGain set so its loudest 100 ms lands on -30 LUFS rendered as written (the convention of
 * `mm sound-listen --calibrate`). `opts`: { profile, cue, meaning, family?, like?, calibrate(recipe) -> masterGain, sampleRate?, candidates (the
 * budget scored in full), search ('es' or 'random') }. `search: 'es'`: per generation PRESCREEN candidates are built and ranked by the cheap score,
 * the best POP are scored in full; after the last generation the top three are scored on two more seeds. `history` holds every candidate scored.
 */
export function cloneRecipe({ profile, cue, meaning, family = null, like = null, calibrate, sampleRate = 48000, candidates = CANDIDATES, search = 'es' }) {
  const fam = family ?? (like ? like.family : familyOfMeaning(meaning));
  if (!TEMPLATES[fam]) throw new Error(`no template for the ${fam} family: use input, surface or outcome`);
  const contour = contourOf(meaning);
  const key = `${cue}|${profile.name}|${fam}|${contour}|${like ? `${round(like.centroidHz, 0)}|${round(like.audibleS, 3)}` : ''}`;
  const ctx = { name: cue, meaning, profile, contour, like };
  // one candidate: rendered, scaled onto the profile's level (level is linear in gain, so the score reads shape, not loudness), measured and judged
  const build = (recipe, { gain = null, seed = null } = {}) => {
    const raw = renderRecipe(recipe, { sampleRate, profile, ...(seed == null ? {} : { seed }) }).channels;
    const mRaw = measure(raw, sampleRate), g = gain ?? 10 ** ((profile.loudness.cueLufs100ms - mRaw.lufs100ms) / 20);
    const channels = raw.map((c) => c.map((x) => x * g)), dB = 20 * Math.log10(g);
    // only the three level measures move with the gain; the rest are read relative to the sound itself
    const m = { ...mRaw, lufs100ms: mRaw.lufs100ms + dB, lufsIntegrated: mRaw.lufsIntegrated + dB, peakDbfs: mRaw.peakDbfs + dB };
    return { recipe, gain: g, channels, m, judged: judgeCue(channels, sampleRate, profile, { durationS: recipe.durationS, measured: m }) };
  };
  const finish = (best, extra) => {
    const recipe = { ...best.recipe, masterGain: round(calibrate(best.recipe), 4) };
    const { channels } = renderRecipe(recipe, { sampleRate, profile });
    const judged = judgeCue(channels, sampleRate, profile, { durationS: recipe.durationS });
    return { recipe, family: fam, contour, measured: measure(channels, sampleRate), checks: judged.checks, artifacts: findArtifacts(channels, sampleRate, { cue }), ...extra };
  };

  if (search === 'random') {
    const rng = mulberry(seedOf(key));
    let best = null;
    for (let i = 0; i < candidates; i++) {
      const c = build(TEMPLATES[fam](rng, ctx));
      const score = scoreOf({ ...c, profile, family: fam, like });
      if (!best || score < best.score) best = { ...c, score, i };
    }
    return finish(best, { score: round(best.score, 3), tried: candidates, winner: best.i, search: { strategy: 'random' }, history: [] });
  }

  const target = like ? (like.target ??= prepareTarget(like.channels, like.sr ?? sampleRate)) : null;
  const rulePenalty = (c) => 10 * misses(c.judged).length + (familyOf(c.recipe.durationS) === fam ? 0 : 10);
  const scoreIn = (c) => {                               // the full score of a built candidate
    const found = findArtifacts(c.channels, sampleRate, { cue });
    const base = target ? scoreAgainst(target, c.channels).total + rulePenalty(c) : preScoreOf({ ...c, profile, family: fam, like, sampleRate });
    return { total: base + 10 * found.length, artifacts: found };
  };
  let built = 0;
  const make = (u) => {
    built++;
    const c = build(TEMPLATES[fam](streamOf(u), ctx));
    return { u, ...c, pre: preScoreOf({ ...c, profile, family: fam, like, sampleRate }) };
  };
  const full = (c) => { const s = scoreIn(c); c.artifacts = s.artifacts; return s.total; };
  // with a --like sound the full score (mel, envelope, onset, tone) costs more than the build, so more candidates are built than scored; without
  // one the cheap score is the score and every candidate built is scored
  const run = evolve({ dims: UNIT_DIMS, make, full, budget: candidates, pop: POP, elite: 4, prescreen: target ? PRESCREEN : POP, seed: seedOf(key) });
  // the three best, each on two more seeds: the one whose worst seed scores best
  const s0 = seedOf(cue), seeds = [s0, (s0 + CONFIRM_SEED_STEP) >>> 0, (s0 + 2 * CONFIRM_SEED_STEP) >>> 0];
  const confirmed = run.history.slice(0, 3).map((c) => {
    const scores = seeds.map((seed, i) => (i === 0 ? c.total : scoreIn(build(c.recipe, { gain: c.gain, seed })).total));
    return { c, seeds, scores: scores.map((x) => round(x, 3)), worst: Math.max(...scores) };
  });
  const pick = confirmed.reduce((a, b) => (b.worst < a.worst ? b : a));
  const summary = { strategy: 'es', generations: run.generations, sigmas: run.sigmas, prescreened: built, scored: run.history.length, confirmed: confirmed.map((x) => ({ seeds: x.seeds, scores: x.scores, worst: round(x.worst, 3), picked: x === pick })) };
  return finish(pick.c, { score: round(pick.worst, 3), tried: run.history.length, winner: run.history.indexOf(pick.c), search: summary, history: run.history, gain: pick.c.gain });
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/**
 * The band the distance between two variants of one cue should fall in, measured on the shipped palette (patterns/sound/<name>/recipe.json,
 * voiced by `profile`): `within` the distances between takes of one cue at seeds the mixer rings it through (a variant must be farther than the
 * widest of those: nearer is a take, a copy), `across` the distances between different cues of one family (a variant must be nearer than the
 * median of those: farther is a stranger). `lo` and `hi` are those two numbers (`soundDistance` units); each row is { cue, total, toneDb,
 * envelope, character }.
 */
export function variantBand({ profile = null, sampleRate = 48000, library = join(ROOT, 'patterns', 'sound') } = {}) {
  const cues = readdirSync(library).filter((n) => existsSync(join(library, n, 'recipe.json'))).sort().map((n) => loadRecipe(join(library, n, 'recipe.json')));
  const within = [], across = [], feats = [];
  for (const recipe of cues) {
    const s0 = seedOf(recipe.name), seeds = [0, 1, 2, 3].map((k) => (s0 + k * CONFIRM_SEED_STEP) >>> 0);
    const f = seeds.map((seed) => soundFeatures(renderRecipe(recipe, { sampleRate, profile, seed }).channels, sampleRate));
    for (let k = 1; k < f.length; k++) within.push({ cue: recipe.name, ...featureDistance(f[0], f[k]) });
    feats.push({ name: recipe.name, family: familyOf(recipe.durationS), f: f[0] });
  }
  for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) if (feats[i].family === feats[j].family) across.push({ cue: `${feats[i].name}~${feats[j].name}`, ...featureDistance(feats[i].f, feats[j].f) });
  const lo = Math.max(...within.map((d) => d.total)), hi = Math.max(median(across.map((d) => d.total)), lo * 2);
  return { lo: Math.ceil(lo * 1000) / 1000, hi: round(hi, 3), within, across };   // lo rounds up: the band never shuts out the widest take
}

/**
 * N variants of one cue from one search: the best candidate is the cue, the others are the best candidates of the same search whose distance to
 * every variant already chosen (`soundDistance`: third-octave and envelope) lies inside `variantBand`, that miss no W-PALETTE check, carry no
 * artifact and score within a margin of the best. The variants are named `<cue>`, `<cue>-2`, `<cue>-3`, and each is measured under its own
 * name's seed. `{ variants, pairs, band, inBand, distances: { min, median, max, clearlyDifferent }, shortfall }`.
 */
export function cloneVariants({ count = 2, ...opts }) {
  const { profile, cue, sampleRate = 48000 } = opts;
  const first = cloneRecipe(opts), band = variantBand({ profile, sampleRate });
  const named = (recipe, k) => ({ ...recipe, name: k === 0 ? cue : `${cue}-${k + 1}` });
  const draw = (recipe) => renderRecipe(recipe, { sampleRate, profile }).channels;
  const chosen = [{ ...first, features: soundFeatures(draw(first.recipe), sampleRate), history: undefined }];
  const best = first.history.length ? Math.min(...first.history.map((h) => h.total)) : first.score, margin = Math.max(2, 0.5 * best);
  for (const h of first.history) {
    if (chosen.length >= count) break;
    const same = (r) => JSON.stringify(r.layers) === JSON.stringify(h.recipe.layers);
    if (chosen.some((c) => same(c.recipe)) || h.total > best + margin || misses(h.judged).length || (h.artifacts ?? []).length) continue;
    const recipe = named(h.recipe, chosen.length), channels = draw({ ...recipe, masterGain: undefined });
    const f = soundFeatures(channels, sampleRate);
    const ok = chosen.every((c) => { const d = featureDistance(c.features, f); return d.total >= band.lo && d.total <= band.hi; });
    if (!ok) continue;
    const withGain = { ...recipe, masterGain: round(opts.calibrate(recipe), 4) };
    const out = renderRecipe(withGain, { sampleRate, profile }).channels;
    chosen.push({ recipe: withGain, family: first.family, contour: first.contour, score: round(h.total, 3), tried: first.tried, measured: measure(out, sampleRate), checks: judgeCue(out, sampleRate, profile, { durationS: withGain.durationS }).checks, artifacts: findArtifacts(out, sampleRate, { cue: recipe.name }), search: first.search, features: f });
  }
  const pairs = [];
  for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) {
    const d = featureDistance(chosen[i].features, chosen[j].features);
    pairs.push({ a: chosen[i].recipe.name, b: chosen[j].recipe.name, total: round(d.total, 2), toneDb: round(d.toneDb, 2), envelope: round(d.envelope, 2), character: round(d.character, 2) });
  }
  const totals = pairs.map((p) => p.total);
  const distances = totals.length ? { min: Math.min(...totals), median: round(median(totals), 2), max: Math.max(...totals), clearlyDifferent: pairs.filter((p) => p.character > 1.5).length } : { min: 0, median: 0, max: 0, clearlyDifferent: 0 };
  return { variants: chosen.map(({ features, history, ...v }) => v), pairs, band: { lo: band.lo, hi: band.hi }, bandMeasured: { within: band.within.length, across: band.across.length }, inBand: pairs.every((p) => p.total >= band.lo - 1e-9 && p.total <= band.hi + 1e-9), distances, shortfall: Math.max(0, count - chosen.length) };
}

/** The PATTERN.md of a cloned cue: the seven sections of contracts/pattern-card.md, the profile it was cloned from, and that profile's sources. */
export function cardOf({ recipe, profile, profileRef, family, contour, measured: m, checks, like, likeName, variants = null }) {
  const f = (x, p = 1) => (Number.isFinite(x) ? round(x, p) : x);
  const src = (profile.sources ?? []).map((s) => `- ${s.source}, ${s.licence}${s.author ? `, ${s.author}` : ''}`);
  const ok = checks.every((c) => c.ok);
  return `# sound/${recipe.name}

## Purpose
${recipe.meaning.replace(/^./, (c) => c.toUpperCase())}. ${family === 'outcome' ? 'An' : 'A'} ${family} cue (${f(recipe.durationS, 2)} s) with a ${contour === 'rise' ? 'rising' : contour === 'fall' ? 'falling' : 'level'} contour, cloned from the sound profile \`${profile.name}\`${like ? ` and shaped toward the sound \`${likeName}\`` : ''}.

## Use when / Do not use when
Use when:
- ${recipe.meaning}

Do not use when:
- the event has no visible moment on screen (a cue with no visible event does not exist, W-CUE)
- it would sound per word, per token or on every hover

## Params
A recipe cue: \`recipe.json\` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with \`layers()\` in \`runtime/kit/synth.js\`. \`render(ctx, at, feel, opts)\` is the same call as for a code cue; \`feel\` is not read, because a recipe is voiced by the style's \`sound.profile\`. The module's \`durationS\` is ${f(recipe.durationS, 2)}.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | ${seedOf(recipe.name)} | seed for the noise, the side spread${recipe.vary ? ' and the variation' : ''}; the same seed renders the same samples |
| emphasis | string | normal | \`subtle\`, \`normal\` or \`strong\`: which layers play |

A beat sets them in \`params.cue\`: \`{ "cue": "${recipe.name}", "params": { "cue": { "emphasis": "strong" } } }\`.

Brand knobs: emphasis, gain. A brand sets them for every use with \`style.patterns["sound/${recipe.name}"]\`; the beat's own values win.

## Style variables consumed
None of the \`--mm-*\` variables: a sound pattern has no CSS. The style's \`sound.profile\` (a name in \`styles/sound/\` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's \`loudnessLufs\`, not this pattern.

## Legibility and rest notes
Meaning: ${recipe.meaning}. Cloned by \`mm sound clone\` from the profile \`${profileRef}\` (\`${profile.name}\`): register up to ${profile.register.maxCentreHz} Hz, material ${profile.modes}, loudest-100 ms level ${profile.loudness.cueLufs100ms} LUFS. Family: ${family}, the ladder step of ${f(recipe.durationS, 2)} s. Contour: ${contour}. Measured under that profile: loudest 100 ms ${f(m.lufs100ms)} LUFS, peak ${f(m.peakDbfs)} dBFS, attack ${m.attackS == null ? 'n/a' : f(m.attackS * 1000)} ms, rings ${f(m.audibleS, 2)} s, centre ${Math.round(m.centroidHz)} Hz; ${ok ? 'every W-PALETTE check passes' : `W-PALETTE misses: ${checks.filter((c) => !c.ok).map((c) => c.check).join(', ')}`}. Emphasis arrangements: normal plays the notes and one ornament, subtle only the notes, strong adds one layer. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself. Render is deterministic: seeded noise, no clock, no Math.random.

## Provenance
original. Synthesised from numbers by \`mm sound clone\` (a seeded evolution-strategy search of ${CANDIDATES} candidates, measured with the sound system's own measurer and checked for the defects W-SOUND-ARTIFACT warns for); no sound file and no code is copied.${variants ? ` One of ${variants.names.length} variants of the cue found by the one search (${variants.names.map((n) => `\`${n}\``).join(', ')}): each pair is ${variants.band.lo} to ${variants.band.hi} apart in third-octave and envelope distance, farther than two takes of one shipped cue and nearer than two different cues of a family.` : ''}
${profile.sources?.length ? `Sources of the sound profile \`${profile.name}\`, which this cue was cloned from:\n${src.join('\n')}` : `Sound profile: \`${profile.name}\` (written by hand, no mined sources).`}

## Known limits
- Set by measurement, not by ear: listen to it with \`mm sound-listen --cues ${recipe.name}\` before it ships.
- A clone matches the profile's numbers (register, key, attack, length, level, room, width), not the taste of the sounds it was fitted to.
- Sines, filtered noise and a short room only: nothing is centred above the profile's ${profile.register.maxCentreHz} Hz and nothing sounds below ${profile.register.minHz} Hz.
`;
}

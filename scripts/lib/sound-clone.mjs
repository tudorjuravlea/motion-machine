// Cloning a sound profile's style into a new cue (SPEC §9): analysis by synthesis. A template for the cue's family
// (input, surface, outcome) is drawn many times with a seeded generator; each candidate is rendered
// (runtime/kit/synth.js renderRecipe, the samples an OfflineAudioContext plays), voiced by the profile, measured with
// scripts/lib/audio-measure.mjs (the one measurer `mm sound-listen`, `mm sound mine` and the gate use) and scored
// against the profile's bands, and against a sound given with --like; the nearest candidate is the cue. The same
// inputs give the same recipe. Library only; Node. The verb is scripts/sound-clone.mjs (`mm sound clone`).
//
//   contourOf(meaning)        'rise' | 'fall' | 'level' from the words of the meaning
//   familyOfMeaning(meaning)  'input' | 'surface' | 'outcome' from the words of the meaning
//   cloneRecipe(opts)         { recipe, family, contour, score, tried, measured, checks } (masterGain calibrated as written)
//   likeOf(channels, sr)      what a --like sound asks of the candidates
//   cardOf(opts)              the PATTERN.md of a cloned cue
import { familyOf, renderRecipe, seedOf } from '../../runtime/kit/synth.js';
import { measure } from './audio-measure.mjs';
import { analyseSound } from './sound-mine.mjs';
import { judgeCue, misses } from './sound-palette.mjs';

export const CANDIDATES = 64;
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

const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
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

const partialsOf = (profile) => MATERIAL[profile.modes] ?? MATERIAL.none;
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
  const partials = partialsOf(profile);
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
    if (table.length) layers.push(layerOf({ kind: 'tone', f: table[Math.floor(rng() * table.length)], attackS: attackIn(rng, profile), t60: t60 * 0.7, peak: 0.4, partials: partialsOf(profile) }));
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
    if (table.length) layers.push(layerOf({ kind: 'tone', f: like?.pitchHz ?? table[Math.floor(rng() * table.length)], attackS: attack, t60: Math.min(t60 * 1.1, hi), peak: 0.6, partials: partialsOf(profile) }));
  }
  return finish(name, meaning, layers, { pitch: 0.02, force: 0.15 });
}

const TEMPLATES = { input, surface, outcome };

/** What a --like sound asks of the candidates, from its samples: the numbers the score compares. */
export function likeOf(channels, sr) {
  const m = measure(channels, sr), a = analyseSound(channels, sr);
  return { attackS: m.attackS ?? 0.002, audibleS: m.audibleS, centroidHz: m.centroidHz, flatness: m.flatness, tonal: a.tonal, pitchHz: a.pitchHz, family: a.family, mode: a.mode, partials: a.partials, durationS: m.durationS };
}

const logRatio = (a, b) => Math.abs(Math.log(Math.max(a, 1e-9) / Math.max(b, 1e-9)));

/** The score of a measured candidate (lower is nearer): the profile's band centres, and the --like sound when given; each miss and a wrong family cost 10. */
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

/**
 * Searches CANDIDATES recipes (a seeded draw: the same cue, profile, family, contour and --like give the same recipe) and returns the
 * nearest, with masterGain set so its loudest 100 ms lands on -30 LUFS rendered as written (the convention of `mm sound-listen --calibrate`).
 * `opts`: { profile, cue, meaning, family?, like?, calibrate(recipe) -> masterGain, sampleRate? }.
 */
export function cloneRecipe({ profile, cue, meaning, family = null, like = null, calibrate, sampleRate = 48000, candidates = CANDIDATES }) {
  const fam = family ?? (like ? like.family : familyOfMeaning(meaning));
  if (!TEMPLATES[fam]) throw new Error(`no template for the ${fam} family: use input, surface or outcome`);
  const contour = contourOf(meaning);
  const rng = mulberry(seedOf(`${cue}|${profile.name}|${fam}|${contour}|${like ? `${round(like.centroidHz, 0)}|${round(like.audibleS, 3)}` : ''}`));
  let best = null;
  for (let i = 0; i < candidates; i++) {
    const recipe = TEMPLATES[fam](rng, { name: cue, meaning, profile, contour, like });
    // level is linear in gain: scale the render onto the profile's level, so the score reads shape, not loudness
    const raw = renderRecipe(recipe, { sampleRate, profile }).channels;
    const g = 10 ** ((profile.loudness.cueLufs100ms - measure(raw, sampleRate).lufs100ms) / 20);
    const channels = raw.map((c) => c.map((x) => x * g));
    const m = measure(channels, sampleRate);
    const judged = judgeCue(channels, sampleRate, profile, { durationS: recipe.durationS });
    const score = scoreOf({ m, recipe, judged, profile, family: fam, like });
    if (!best || score < best.score) best = { recipe, score, i };
  }
  const recipe = { ...best.recipe, masterGain: round(calibrate(best.recipe), 4) };
  const { channels } = renderRecipe(recipe, { sampleRate, profile });
  const judged = judgeCue(channels, sampleRate, profile, { durationS: recipe.durationS });
  return { recipe, family: fam, contour, score: round(best.score, 3), tried: candidates, winner: best.i, measured: measure(channels, sampleRate), checks: judged.checks };
}

/** The PATTERN.md of a cloned cue: the seven sections of contracts/pattern-card.md, the profile it was cloned from, and that profile's sources. */
export function cardOf({ recipe, profile, profileRef, family, contour, measured: m, checks, like, likeName }) {
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
original. Synthesised from numbers by \`mm sound clone\` (a seeded search of ${CANDIDATES} candidates, measured with the sound system's own measurer); no sound file and no code is copied.
${profile.sources?.length ? `Sources of the sound profile \`${profile.name}\`, which this cue was cloned from:\n${src.join('\n')}` : `Sound profile: \`${profile.name}\` (written by hand, no mined sources).`}

## Known limits
- Set by measurement, not by ear: listen to it with \`mm sound-listen --cues ${recipe.name}\` before it ships.
- A clone matches the profile's numbers (register, key, attack, length, level, room, width), not the taste of the sounds it was fitted to.
- Sines, filtered noise and a short room only: nothing is centred above the profile's ${profile.register.maxCentreHz} Hz and nothing sounds below ${profile.register.minHz} Hz.
`;
}

#!/usr/bin/env node
// `mm sound clone --profile <profile> --cue <name> --meaning "<text>" [--like <sound>] [--family input|surface|outcome] [--variants <n>] [--out <patterns-dir>] [--force]` (SPEC §9).
//
//   a sound profile (styles/sound/<name>.json, or a profile mined by `mm sound mine`) ──► seeded candidates from a template
//   for the cue's family, rendered offline (runtime/kit/synth.js: the samples an OfflineAudioContext plays), voiced by the
//   profile and measured with scripts/lib/audio-measure.mjs ──► the one nearest the profile's bands (and the --like sound,
//   when given) is written as
//   <out>/sound/<cue>/recipe.json   the cue as data (contracts/sound-recipe.schema.json), level calibrated as `mm sound-listen --calibrate` does
//   <out>/sound/<cue>/PATTERN.md    the card: the profile it was cloned from and that profile's sources
//   <out>/sound/<cue>/demo/cue.json
// --out is a patterns folder (default ./patterns); the cue is then found like any other, by a piece whose patterns base is that
// folder. The same inputs write the same files. The chosen recipe is drawn once more in an OfflineAudioContext (Chromium) and
// must match the samples measured in Node.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { assertTools } from './lib/ffmpeg.mjs';
import { decodeStereo } from './lib/audio-decode.mjs';
import { measure } from './lib/audio-measure.mjs';
import { loadProfile, profileFile } from './lib/sound-profile.mjs';
import { cardOf, cloneRecipe, cloneVariants, likeOf, recipeJson } from './lib/sound-clone.mjs';
import { splitSounds } from './lib/sound-mine.mjs';
import { judgeCue } from './lib/sound-palette.mjs';
import { validators } from './lib/validate.mjs';
import { renderRecipe } from '../runtime/kit/synth.js';
import { calibratedGain } from './sound-listen.mjs';

const SR = 48000;
const CUE = /^[a-z][a-z0-9-]{1,30}$/;

/** Draws `recipe` in an OfflineAudioContext and returns the largest sample difference from renderRecipe in Node (null when no browser could be started). */
async function contextDifference(recipe, profile, feel = 'soft-ui') {
  let r = null;
  try {
    r = await (await import('./lib/cue-render.mjs')).openRenderer();
    const web = await r.renderChannels([{ cue: recipe.name, recipe, profile, at: 0.05, feel, opts: {} }], { seconds: 2.5, sampleRate: SR });
    const node = renderRecipe(recipe, { sampleRate: SR, profile });
    const at = Math.round(0.05 * SR);
    let worst = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < node.length; i++) worst = Math.max(worst, Math.abs(web.channels[c][at + i] - node.channels[c][i]));
    return worst;
  } catch { return null; } finally { await r?.close(); }
}

/**
 * Clones `cue` from `profileRef` and writes it under `<out>/sound/<cue>/`. Returns { dir, recipe, family, contour, checks, measured, contextDiff }.
 * Throws UsageError for a name, a folder or a sound that cannot be used.
 */
export async function cloneCue({ profileRef, cue, meaning, like = null, family = null, out = 'patterns', force = false, check = true, variants = 1, log = () => {} }) {
  if (!CUE.test(cue)) throw new UsageError(`--cue ${cue}: a cue name is lowercase letters, digits and hyphens, starting with a letter (2 to 31 characters)`, 2);
  if (meaning.trim().length < 3) throw new UsageError('--meaning needs a few words: the visible event the cue marks', 2);
  if (family && !['input', 'surface', 'outcome'].includes(family)) throw new UsageError(`--family ${family}: input, surface or outcome`, 2);
  let profile;
  try { profile = loadProfile(profileRef); } catch (e) { throw new UsageError(e.message, 2); }
  if (!Number.isInteger(variants) || variants < 1 || variants > 9) throw new UsageError(`--variants ${variants}: a whole number from 1 to 9`, 2);
  if (variants > 1 && !CUE.test(`${cue}-${variants}`)) throw new UsageError(`--cue ${cue}: with --variants the names ${cue}-2 to ${cue}-${variants} must fit a cue name too (31 characters at most)`, 2);
  const dir = join(resolve(out), 'sound', cue);
  if (variants === 1 && !force && (existsSync(join(dir, 'recipe.json')) || existsSync(join(dir, 'pattern.js')))) throw new UsageError(`${relative(process.cwd(), dir) || dir} already holds a cue; choose another --cue or pass --force to overwrite its recipe`, 2);

  let likeInfo = null;
  if (like) {
    if (!existsSync(like)) throw new UsageError(`--like ${like}: no such file`, 2);
    const sounds = splitSounds(await decodeStereo(like, SR), SR);
    if (!sounds.length) throw new UsageError(`--like ${like}: no sound found in it`, 2);
    likeInfo = likeOf(sounds[0].channels, SR);
    log(`like ${basename(like)}: ${likeInfo.family}, attack ${(likeInfo.attackS * 1000).toFixed(1)} ms, rings ${likeInfo.audibleS.toFixed(2)} s, centre ${Math.round(likeInfo.centroidHz)} Hz${likeInfo.tonal ? `, tonal ${Math.round(likeInfo.pitchHz)} Hz` : ', noise or knock'}`);
  }

  const set = variants > 1 ? cloneVariants({ profile, cue, meaning, family, like: likeInfo, calibrate: calibratedGain, sampleRate: SR, count: variants }) : null;
  const picks = set ? set.variants : [cloneRecipe({ profile, cue, meaning, family, like: likeInfo, calibrate: calibratedGain, sampleRate: SR })];
  const names = picks.map((p) => p.recipe.name);
  const taken = names.filter((n) => !force && (existsSync(join(resolve(out), 'sound', n, 'recipe.json')) || existsSync(join(resolve(out), 'sound', n, 'pattern.js'))));
  if (taken.length) throw new UsageError(`${taken.map((n) => relative(process.cwd(), join(resolve(out), 'sound', n)) || n).join(', ')} already holds a cue; choose another --cue or pass --force to overwrite its recipe`, 2);
  const v = validators();
  const written = [];
  for (const res of picks) {
    if (!v.soundRecipe(res.recipe)) throw new Error(`the cloned recipe does not validate: ${(v.soundRecipe.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
    const diff = check ? await contextDifference(res.recipe, profile) : null;
    if (diff != null && diff > 1e-5) throw new Error(`the audio context and Node disagree by ${diff} on the cloned recipe`);
    const { channels } = renderRecipe(res.recipe, { sampleRate: SR, profile });
    const measured = measure(channels, SR), checks = judgeCue(channels, SR, profile, { durationS: res.recipe.durationS }).checks;
    const cueDir = join(resolve(out), 'sound', res.recipe.name);
    mkdirSync(join(cueDir, 'demo'), { recursive: true });
    writeFileSync(join(cueDir, 'recipe.json'), recipeJson(res.recipe));
    writeFileSync(join(cueDir, 'PATTERN.md'), cardOf({ recipe: res.recipe, profile, profileRef: /^[a-z][a-z0-9-]{1,40}$/.test(profileRef) ? profileRef : basename(profileFile(profileRef)), family: res.family, contour: res.contour, measured, checks, like: Boolean(like), likeName: like ? basename(like) : null, variants: set ? { names, band: set.band } : null }));
    writeFileSync(join(cueDir, 'demo', 'cue.json'), `${JSON.stringify({ at: [0.5, 1.5, 2.5], emphasis: ['subtle', 'normal', 'strong'], profile: profileRef })}\n`);
    written.push({ dir: cueDir, recipe: res.recipe, family: res.family, contour: res.contour, score: res.score, tried: res.tried, checks, measured, artifacts: res.artifacts, contextDiff: diff });
  }
  return { ...written[0], variants: written, report: set ? { pairs: set.pairs, band: set.band, inBand: set.inBand, distances: set.distances, shortfall: set.shortfall } : null };
}

runMain(import.meta, async () => {
  let a;
  try {
    a = parseArgs({ allowPositionals: true, strict: true, options: { profile: { type: 'string' }, cue: { type: 'string' }, meaning: { type: 'string' }, like: { type: 'string' }, family: { type: 'string' }, variants: { type: 'string', default: '1' }, out: { type: 'string', default: 'patterns' }, force: { type: 'boolean', default: false } } });
  } catch (e) { throw new UsageError(`${e.message}\n${usageText('sound clone')}`, 2); }
  const { values, positionals } = a;
  if (positionals.length || !values.profile || !values.cue || !values.meaning) throw new UsageError(usageText('sound clone'), 2);
  if (values.like) assertTools();
  const variants = Number(values.variants);
  const res = await cloneCue({ profileRef: values.profile, cue: values.cue, meaning: values.meaning, like: values.like ? resolve(values.like) : null, family: values.family ?? null, out: values.out, force: values.force, variants, log: console.log });
  for (const v of res.variants) {
    const missed = v.checks.filter((c) => !c.ok).map((c) => c.check);
    console.log(`sound clone: ${v.recipe.name} (${v.family}, ${v.contour}, ${v.recipe.durationS} s) from ${values.profile} -> ${relative(process.cwd(), v.dir) || v.dir}; loudest 100 ms ${v.measured.lufs100ms.toFixed(1)} LUFS, ${missed.length ? `W-PALETTE would miss: ${missed.join(', ')}` : 'inside the profile'}${v.artifacts.length ? `; W-SOUND-ARTIFACT would warn: ${v.artifacts.map((f) => f.kind).join(', ')}` : ''}${v.contextDiff == null ? '; audio-context check not run (no browser)' : '; audio context agrees'}`);
  }
  if (res.report) {
    const r = res.report, d = r.distances;
    console.log(`sound clone: ${res.variants.length} variants${r.shortfall ? ` (${r.shortfall} fewer than asked: the search found no more inside the band)` : ''}; each pair should sit ${r.band.lo} to ${r.band.hi} apart (farther than two takes of one shipped cue, nearer than two different cues of a family): ${r.inBand ? 'all inside' : 'NOT all inside'}; min ${d.min}, median ${d.median}, max ${d.max}`);
    for (const p of r.pairs) console.log(`  ${p.a} ~ ${p.b}: ${p.total} (tone ${p.toneDb} dB, envelope ${p.envelope}, character ${p.character})`);
  }
  return 0;
});
